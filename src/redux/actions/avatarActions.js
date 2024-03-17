import crypto from 'react-native-quick-crypto'
import { actionType } from './actionType'
import { call, put, select, take, cancelled, fork } from 'redux-saga/effects'
import { eventChannel, END } from 'redux-saga'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { DefaultHost, Epoch, GenesisAddress, GenesisHash, ActionCode, DefaultPartition, GroupRequestActionCode, GroupManageActionCode, GroupMemberShip, ObjectType, SessionType, BulletinPageSize, MessagePageSize, BulletinHistorySession, BulletinMarkSession, BulletinAddressSession } from '../../lib/Const'
import { deriveJson, checkJsonSchema, checkBulletinSchema, checkFileSchema, checkFileChunkSchema, checkObjectSchema, checkBulletinAddressListResponseSchema, checkBulletinReplyListResponseSchema } from '../../lib/MessageSchemaVerifier'
import { DHSequence, AesEncrypt, AesDecrypt, DeriveKeypair, DeriveAddress, VerifyJsonSignature, quarterSHA512, AvatarLoginTimeUpdate } from '../../lib/OXO'
import Database from '../../lib/Database'
import MessageGenerator from '../../lib/MessageGenerator'

function DelayExec(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function Array2Str(array) {
  let tmpArray = []
  for (let i = array.length - 1; i >= 0; i--) {
    tmpArray.push(`'${array[i]}'`)
  }
  return tmpArray.join(',')
}

function setStorageItem(key, json) {
  try {
    AsyncStorage.setItem(key, JSON.stringify(json)).then(() => {
      // console.log(`setStorageItem:#key#:${key}`)
      // console.log(`setStorageItem:value:${JSON.stringify(json)}`)
      // return true
    })
  } catch (e) {
    console.log(e)
    // return false
  }
}

// WebSocket
function createWebSocket(url) {
  // console.log(`======================================================createWebSocket`)
  return new Promise((resolve, reject) => {
    let ws = new WebSocket(url)
    ws.onopen = () => {
      console.log(`DEBUG======================================================createWebSocket-open`)
      resolve(ws)
    }
    ws.onerror = (error) => {
      //{"isTrusted": false, "message": "Connection reset"}
      //TODO: catch this error
      console.log(`DEBUG======================================================createWebSocket-error`)
      console.log(error)
      reject(error)
    }
  })
}

function createWebSocketChannel(ws) {
  return eventChannel(emit => {
    // Pass websocket messages straight though
    ws.onmessage = (event) => {
      // console.log(`DEBUG======================================================onmessage>>>`)
      console.log(event.data)
      // console.log(`DEBUG======================================================onmessage<<<`)
      emit(event.data)
    }

    // Close the channel as appropriate
    ws.onclose = () => {
      console.log(`DEBUG======================================================onclose`)
      emit(END)
    }

    const unsubscribe = () => {
      ws.onmessage = null
    }
    return unsubscribe
  })
}

export function* Conn(action) {

  // Get some basics together
  let state = yield select()
  let MessageGenerator = state.avatar.get('MessageGenerator')
  let CurrentHost = state.avatar.get('CurrentHost')
  let CurrentHostTimestamp = state.avatar.get('CurrentHostTimestamp')
  let Address = state.avatar.get('Address')

  console.log(`======================================================CurrentHost`)
  console.log(`${CurrentHost}==${action.host}==${CurrentHostTimestamp}==${action.timestamp}`)
  if (CurrentHost == null || CurrentHostTimestamp != action.timestamp) {
    return
  }

  // console.log(`======================================================${CurrentHost}`)
  // console.log(`======================================================Conn`)
  try {

    // Make our connection
    let ws = yield call(createWebSocket, action.host)
    let channel = yield call(createWebSocketChannel, ws)

    yield put({ type: actionType.avatar.setWebSocketChannel, channel: channel })

    if (ws.readyState == WebSocket.OPEN) {
      yield put({ type: actionType.avatar.setConnStatus, status: true })
      let msg = MessageGenerator.genDeclare()
      ws.send(msg)
      yield put({ type: actionType.avatar.setWebSocket, websocket: ws })
    }

    // Handle messages as they come in
    while (true) {
      // console.log(`======================================================yield take(1channel)`)
      let payload = yield take(channel)
      let json = JSON.parse(payload)
      // console.log(`======================================================yield take(2channel)`)

      if (json.Action == ActionCode.BulletinAddressListResponse && checkBulletinAddressListResponseSchema(json)) {
        yield put({ type: actionType.avatar.setBulletinAddressList, bulletin_address_list: json.List })
      }
      else if (json.Action == ActionCode.BulletinReplyListResponse && checkBulletinReplyListResponseSchema(json)) {
        yield put({ type: actionType.avatar.setBulletinReplyList, bulletin_reply_list: json.List })
      }

      //save bulletin from server cache
      else if (json.ObjectType == ObjectType.Bulletin && checkBulletinSchema(json)) {
        let address = DeriveAddress(json.PublicKey)
        yield put({ type: actionType.avatar.SaveBulletin, relay_address: address, bulletin_json: json })
      }

      //handle message send To me
      else if (checkJsonSchema(json)) {
        //check receiver is me
        if (json.To != Address && json.Action != ActionCode.ChatSyncFromServer) {
          console.log('receiver is not me...')
        }

        //verify signature
        else if (VerifyJsonSignature(json) == true) {
          switch (json.Action) {
            case ActionCode.ChatDH:
              yield put({ type: actionType.avatar.HandleFriendECDH, json: json })
              break
            case ActionCode.ChatMessage:
              yield put({ type: actionType.avatar.HandleFriendMessage, json: json })
              break
            case ActionCode.ChatSync:
              yield put({ type: actionType.avatar.HandleChatSyncFromFriend, json: json })
              break
            case ActionCode.ChatSyncFromServer:
              yield put({ type: actionType.avatar.HandleChatSyncFromServer, json: json })
              break
            case ActionCode.BulletinRequest:
              yield put({ type: actionType.avatar.HandleBulletinRequest, json: json })
              break
            // case ActionCode.BulletinFileRequest:
            //   console.log('HandleBulletinFileRequest(json)')
            //   break
            // case ActionCode.PrivateFileRequest:
            //   console.log('HandlePrivateFileRequest(json)')
            //   break
            // case ActionCode.GroupFileRequest:
            //   console.log('HandleGroupFileRequest(json)')
            //   break
            case ActionCode.ObjectResponse:
              let address = DeriveAddress(json.PublicKey)
              let objectJson = json.Object
              if (objectJson.ObjectType == ObjectType.Bulletin && checkBulletinSchema(objectJson)) {
                yield put({ type: actionType.avatar.SaveBulletin, relay_address: address, bulletin_json: objectJson })
              }
              // else if (objectJson.ObjectType == ObjectType.BulletinFile && checkFileChunkSchema(objectJson)) {
              //   console.log('SaveBulletinFile(address, objectJson)')
              // } else if (objectJson.ObjectType == ObjectType.PrivateFile && checkFileChunkSchema(objectJson)) {
              //   console.log('SavePrivateFile(address, objectJson)')
              // } else if (objectJson.ObjectType == ObjectType.GroupFile && checkFileChunkSchema(objectJson)) {
              //   console.log('SaveGroupFile(address, objectJson)')
              // } else if (objectJson.ObjectType == ObjectType.GroupManage && checkGroupManageSchema(objectJson)) {
              //   console.log('SaveGroupManage(address, objectJson)')
              // } else if (objectJson.ObjectType == ObjectType.GroupMessage) {
              //   console.log('SaveGroupMessage(address, objectJson)')
              // }
              break
            // case ActionCode.GroupRequest:
            //   console.log('HandleGroupRequest(json)')
            //   break
            // case ActionCode.GroupManageSync:
            //   console.log('HandleGroupManageSync(json)')
            //   break
            // case ActionCode.GroupDH:
            //   console.log('HandleGroupDH(json)')
            //   break
            // case ActionCode.GroupMessageSync:
            //   console.log('HandleGroupMessageSync(json)')
            //   break
            default:
              break
          }
        }
      } else {
        console.log("======================================================json schema invalid...")
        // console.log(payload)
        // console.log(json)
      }
      //yield put(nowPlayingUpdate(stationName, artist, title, artUrl))
    }
  } catch (error) {
    console.log(`======================================================Conn-catch-error`)
    console.log(error)
    if (error.name == 'SyntaxError' && error.message == 'JSON Parse error: Unexpected identifier "object"') {
      console.log(`======================================================never go here${error}`)
    } else {

    }
    // let regx = /^failed to connect to/
    // let rs = regx.exec(error.message)
    // if (rs != null) {
    //   console.log(`====================================================yield put(Conn)`)
    //   yield put({ type: actionType.avatar.Conn })
    // }
    //{"isTrusted": false, "message": "failed to connect to /127.0.0.1 (port 3000) from /10.0.2.15 (port 36216) after 10000ms"}
  } finally {
    console.log(`======================================================Conn-finally`)
    CurrentHost = yield select(state => state.avatar.get('CurrentHost'))
    CurrentHostTimestamp = yield select(state => state.avatar.get('CurrentHostTimestamp'))
    console.log(`${CurrentHost}==${action.host}==${CurrentHostTimestamp}==${action.timestamp}`)
    if (CurrentHost != null && CurrentHost == action.host && CurrentHostTimestamp == action.timestamp) {
      yield put({ type: actionType.avatar.setConnStatus, status: false })
    }
    // Clean up the connection
    if (typeof channel !== 'undefined') {
      channel.close()
    }
    if (typeof ws !== 'undefined') {
      ws.close()
    }
    //断开，等待3秒，重连
    yield call(DelayExec, 3 * 1000)
    console.log(`======================================================reconnect`)
    yield put({ type: actionType.avatar.Conn, host: action.host, timestamp: action.timestamp })
    // console.log(`======================================================reconnect`)
    // if (yield cancelled()) {
    //   console.log(`================================================Conn-cancelled`)
    //   if (typeof channel !== 'undefined') {
    //     channel.close()
    //   }
    //   if (typeof ws !== 'undefined') {
    //     ws.close()
    //   }
    // } else {
    // }
  }
}

export function* SendMessage(action) {
  // console.log(`DEBUG======================================================SendMessage`)
  // console.log(action.message)
  let ws = yield select(state => state.avatar.get('WebSocket'))
  if (ws != null && ws.readyState == WebSocket.OPEN) {
    ws.send(action.message)
  }
}

// Avatar
export function* loadFromDB(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let address = yield select(state => state.avatar.get('Address'))
  let name = yield select(state => state.avatar.get('Name'))
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))

  // AddressMap
  let sql = `SELECT * FROM ADDRESS_MARKS ORDER BY updated_at DESC`
  let items = yield call([db, db.getAll], sql)
  let address_map = {}
  items.forEach(item => {
    address_map[item.address] = item.name
  })
  address_map[address] = name
  yield put({ type: actionType.avatar.setAddressBook, address_map: address_map })

  // Friend
  sql = `SELECT * FROM FRIENDS ORDER BY updated_at DESC`
  items = yield call([db, db.getAll], sql)
  let friend_list = []
  items.forEach(item => {
    friend_list.push(item.address)
  })
  yield put({ type: actionType.avatar.setFriends, friend_list: friend_list })

  // Friend Request
  sql = `SELECT * FROM FRIEND_REQUESTS ORDER BY updated_at ASC`
  items = yield call([db, db.getAll], sql)
  let friend_request_list = []
  items.forEach(item => {
    friend_request_list.push({ Address: item.address, Timestamp: item.updated_at })
  })
  yield put({ type: actionType.avatar.setFriendRequests, friend_request_list: friend_request_list })

  // Follow
  sql = `SELECT * FROM FOLLOWS ORDER BY updated_at DESC`
  items = yield call([db, db.getAll], sql)
  let follow_list = []
  items.forEach(item => {
    follow_list.push(item.address)
  })
  yield put({ type: actionType.avatar.setFollows, follow_list: follow_list })

  // Fetch follow bulletin
  sql = `SELECT address, sequence FROM BULLETINS WHERE address IN (${Array2Str(follow_list)}) GROUP BY address ORDER BY sequence DESC`
  items = yield call([db, db.getAll], sql)
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    yield put({ type: actionType.avatar.FetchBulletin, address: item.address, sequence: item.sequence + 1, to: address })
  }

  // SessionList
  sql = `SELECT * FROM MESSAGES GROUP BY sour_address`
  let recent_message_receive = []
  items = yield call([db, db.getAll], sql)
  items.forEach(message => {
    recent_message_receive.push({
      Address: message.sour_address,
      Timestamp: message.timestamp,
      Content: message.content
    })
  })

  sql = `SELECT * FROM MESSAGES GROUP BY dest_address`
  let recent_message_send = []
  items = yield call([db, db.getAll], sql)
  items.forEach(message => {
    recent_message_send.push({
      Address: message.dest_address,
      Timestamp: message.timestamp,
      Content: message.content
    })
  })

  let session_map = {}
  friend_list.forEach(friend => {
    session_map[friend] = { Address: friend, Timestamp: Epoch, Content: '', CountUnread: 0 }
  })
  recent_message_receive.forEach(message => {
    if (message && session_map[message.Address]) {
      session_map[message.Address].Timestamp = message.Timestamp
      session_map[message.Address].Content = message.Content
    }
  })
  recent_message_send.forEach(message => {
    if (message && session_map[message.Address] && message.Timestamp > session_map[message.Address].Timestamp) {
      session_map[message.Address].Timestamp = message.Timestamp
      session_map[message.Address].Content = message.Content
    }
  })
  yield put({ type: actionType.avatar.setSessionMap, session_map: session_map })

  // Fetch friend message
  sql = `SELECT sour_address, sequence FROM MESSAGES WHERE sour_address IN (${Array2Str(friend_list)}) GROUP BY sour_address ORDER BY sequence DESC`
  items = yield call([db, db.getAll], sql)
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    friend_list = friend_list.filter(friend => friend != item.sour_address)
    let msg = MessageGenerator.genFriendSync(item.sequence, item.sour_address)
    yield put({ type: actionType.avatar.SendMessage, message: msg })
  }
  for (let index = 0; index < friend_list.length; index++) {
    const friend = friend_list[index]
    let msg = MessageGenerator.genFriendSync(0, friend)
    yield put({ type: actionType.avatar.SendMessage, message: msg })
  }
}

export function* enableAvatar(action) {
  let timestamp = Date.now()
  let keypair = DeriveKeypair(action.seed)
  let address = DeriveAddress(keypair.publicKey)
  // 更新登录时间
  AvatarLoginTimeUpdate(address)

  yield put({ type: actionType.avatar.setAvatar, seed: action.seed, name: action.name, address: address, public_key: keypair.publicKey, private_key: keypair.privateKey })

  let mg = new MessageGenerator(keypair.publicKey, keypair.privateKey)
  yield put({ type: actionType.avatar.setMessageGenerator, message_generator: mg })

  let db = new Database()

  yield call([db, db.initDB], address, '0.0.1', address, 0)
  yield put({ type: actionType.avatar.setDatabase, db: db })

  // Load from db, very slow
  yield put({ type: actionType.avatar.loadFromDB })

  let host_list = yield select(state => state.avatar.get('HostList'))
  let current_host = host_list[0].Address
  yield put({ type: actionType.avatar.setCurrentHost, current_host: current_host, current_host_timestamp: timestamp })
  console.log(`======================================================enableAvatar`)
  yield put({ type: actionType.avatar.Conn, host: current_host, timestamp: timestamp })
  // update
  yield put({ type: actionType.avatar.UpdateFollowBulletin })
}

export function* disableAvatar(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let self_address = yield select(state => state.avatar.get('Address'))

  // 清理多余缓存公告
  let bulletin_cache_size = yield select(state => state.avatar.get('BulletinCacheSize'))
  if (bulletin_cache_size != 0) {
    let sql = `SELECT hash FROM BULLETINS WHERE is_cache = 'TRUE' AND is_mark = 'FALSE' ORDER BY created_at DESC LIMIT ${bulletin_cache_size}`
    let items = yield call([db, db.getAll], sql)
    let hashes = []
    items.forEach(item => {
      hashes.push(item.hash)
    })
    sql = `DELETE FROM BULLETINS where is_cache = 'TRUE' AND is_mark = 'FALSE' AND hash NOT IN (${Array2Str(hashes)})`
    console.log(sql)
    yield call([db, db.runSQL], sql)
  }

  // 关闭数据库
  yield call([db, db.closeDB], action.flag_clear_db, self_address)
  yield put({ type: actionType.avatar.resetAvatar })

  // 关闭网络
  let channel = yield select(state => state.avatar.get('WebSocketChannel'))
  console.log(channel)
  if (channel != null) {
    yield call([channel, channel.close])
  }
  let ws = yield select(state => state.avatar.get('WebSocket'))
  console.log(ws)
  if (ws != null) {
    yield call([ws, ws.close])
  }
}

export function* removeBulletinCache(action) {
  let bulletin_cache_size = action.bulletin_cache_size
  let db = yield select(state => state.avatar.get('Database'))
  let follow_list = yield select(state => state.avatar.get('Follows'))
  let address_list = Array2Str(follow_list)
  let sql = `SELECT hash FROM BULLETINS WHERE is_mark = "FALSE" ORDER BY created_at DESC OFFSET ${bulletin_cache_size}`
  if (address_list != "") {
    sql = `SELECT hash FROM BULLETINS WHERE is_mark = "FALSE" AND address NOT IN (${address_list}) ORDER BY created_at DESC OFFSET ${bulletin_cache_size}`
  }
  let bulletin_hash_list = yield call([db, db.getAll], sql)

  // delete bulletin
  sql = `DELETE FROM BULLETINS WHERE hash in (${bulletin_hash_list})`
  yield call([db, db.runSQL], sql)
  // delete quote
  sql = `DELETE FROM QUOTES WHERE quote_hash in (${bulletin_hash_list})`
  yield call([db, db.runSQL], sql)
}

export function* changeBulletinCacheSize(action) {
  let bulletin_cache_size = yield select(state => state.avatar.get('BulletinCacheSize'))
  if (action.bulletin_cache_size != 0 && action.bulletin_cache_size < bulletin_cache_size) {
    yield put({ type: actionType.avatar.removeBulletinCache, bulletin_cache_size: action.bulletin_cache_size })
  }
  bulletin_cache_size = action.bulletin_cache_size
  yield put({ type: actionType.avatar.setBulletinCacheSize, bulletin_cache_size: bulletin_cache_size })
  yield call(setStorageItem, `BulletinCacheSize`, bulletin_cache_size)
}

///////////////////////////////////////////////////////////////////////////////
// AddressBook
///////////////////////////////////////////////////////////////////////////////
export function* addAddressMark(action) {
  let timestamp = Date.now()
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `INSERT INTO ADDRESS_MARKS (address, name, created_at, updated_at)
  VALUES ('${action.address}', '${action.name}', ${timestamp}, ${timestamp})`
  yield call([db, db.runSQL], sql)
  let address_map = yield select(state => state.avatar.get('AddressMap'))
  address_map[action.address] = action.name
  yield put({ type: actionType.avatar.setAddressBook, address_map: address_map })
}

export function* delAddressMark(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `DELETE FROM ADDRESS_MARKS WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)
  let address_map = yield select(state => state.avatar.get('AddressMap'))
  delete address_map[action.address]
  yield put({ type: actionType.avatar.setAddressBook, address_map: address_map })
}

export function* saveAddressName(action) {
  let timestamp = Date.now()
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `UPDATE ADDRESS_MARKS SET name = '${action.name}', updated_at = ${timestamp} WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)
  let address_map = yield select(state => state.avatar.get('AddressMap'))
  address_map[action.address] = action.name
  console.log(`========================saveAddressName`)
  console.log(address_map)
  yield put({ type: actionType.avatar.setAddressBook, address_map: address_map })
}

// Friend
export function* addFriend(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let timestamp = Date.now()
  let sql = `INSERT INTO FRIENDS (address, created_at, updated_at)
VALUES ('${action.address}', ${timestamp}, ${timestamp})`
  yield call([db, db.runSQL], sql)
  let friend_list = yield select(state => state.avatar.get('Friends'))
  friend_list.push(action.address)
  yield put({ type: actionType.avatar.setFriends, friend_list: friend_list })

  //刷新当前AddressMark
  let current_address_mark = yield select(state => state.avatar.get('CurrentAddressMark'))
  if (current_address_mark || action.address == current_address_mark.Address) {
    yield put({ type: actionType.avatar.setCurrentAddressMark, address: action.address })
  }

  //刷新会话列表
  let session_map = yield select(state => state.avatar.get('SessionMap'))
  session_map[action.address] = { Address: action.address, Timestamp: timestamp, Content: '', CountUnread: 0 }
  yield put({ type: actionType.avatar.setSessionMap, session_map: session_map })
}

export function* delFriend(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `DELETE FROM FRIENDS WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)
  let friend_list = yield select(state => state.avatar.get('Friends'))
  friend_list = friend_list.filter((item) => item != action.address)
  yield put({ type: actionType.avatar.setFriends, friend_list: friend_list })

  //刷新当前AddressMark
  let current_address_mark = yield select(state => state.avatar.get('CurrentAddressMark'))
  if (current_address_mark || action.address == current_address_mark.Address) {
    yield put({ type: actionType.avatar.setCurrentAddressMark, address: action.address })
  }

  //清除聊天痕迹
  sql = `DELETE FROM MESSAGES WHERE sour_address = "${action.address}" OR dest_address = "${action.address}"`
  yield call([db, db.runSQL], sql)
  sql = `DELETE FROM ECDHS WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)

  //刷新会话列表
  let session_map = yield select(state => state.avatar.get('SessionMap'))
  delete session_map[action.address]
  yield put({ type: actionType.avatar.setSessionMap, session_map: session_map })
}

// Follow
export function* addFollow(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let timestamp = Date.now()
  let sql = `INSERT INTO FOLLOWS (address, created_at, updated_at)VALUES ('${action.address}', ${timestamp}, ${timestamp})`
  yield call([db, db.runSQL], sql)
  let follow_list = yield select(state => state.avatar.get('Follows'))
  follow_list.push(action.address)
  yield put({ type: actionType.avatar.setFollows, follow_list: follow_list })

  //刷新当前AddressMark
  let current_address_mark = yield select(state => state.avatar.get('CurrentAddressMark'))
  if (current_address_mark || action.address == current_address_mark.Address) {
    yield put({ type: actionType.avatar.setCurrentAddressMark, address: action.address })
  }

  //更新Bulletin的is_cache
  sql = `UPDATE BULLETINS SET is_cache = "FALSE" WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)
}

export function* delFollow(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `DELETE FROM FOLLOWS WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)
  let follow_list = yield select(state => state.avatar.get('Follows'))
  follow_list = follow_list.filter((item) => item != action.address)
  yield put({ type: actionType.avatar.setFollows, follow_list: follow_list })

  //刷新当前AddressMark
  let current_address_mark = yield select(state => state.avatar.get('CurrentAddressMark'))
  if (current_address_mark || action.address == current_address_mark.Address) {
    yield put({ type: actionType.avatar.setCurrentAddressMark, address: action.address })
  }

  //更新Bulletin的is_cache
  sql = `UPDATE BULLETINS SET is_cache = "TRUE" WHERE address = "${action.address}"`
  yield call([db, db.runSQL], sql)
}

///////////////////////////////////////////////////////////////////////////////
// Host
///////////////////////////////////////////////////////////////////////////////
export function* changeHostList(action) {
  yield put({ type: actionType.avatar.setHostList, host_list: action.host_list })
  yield call(setStorageItem, 'HostList', action.host_list)
}

export function* addHost(action) {
  let timestamp = Date.now()
  let host_list = yield select(state => state.avatar.get('HostList'))
  console.log(host_list)
  host_list = host_list.filter((host) => host.Address != action.host)
  host_list.unshift({ Address: action.host, UpdatedAt: timestamp })
  console.log(host_list)
  yield put({ type: actionType.avatar.setHostList, host_list: host_list })
  yield call(setStorageItem, 'HostList', host_list)
}

export function* delHost(action) {
  let host_list = yield select(state => state.avatar.get('HostList'))
  host_list = host_list.filter((host) => host.Address != action.host)
  yield put({ type: actionType.avatar.setHostList, host_list: host_list })
  yield call(setStorageItem, 'HostList', host_list)
}

export function* changeCurrentHost(action) {
  let timestamp = Date.now()

  let channel = yield select(state => state.avatar.get('WebSocketChannel'))
  console.log(channel)
  if (channel != null) {
    yield call([channel, channel.close])
  }
  let ws = yield select(state => state.avatar.get('WebSocket'))
  console.log(ws)
  if (ws != null) {
    yield call([ws, ws.close])
  }
  yield put({ type: actionType.avatar.setCurrentHost, current_host: action.host, current_host_timestamp: timestamp })
  console.log(`======================================================changeCurrentHost`)
  yield put({ type: actionType.avatar.Conn, host: action.host, timestamp: timestamp })

  let host_list = yield select(state => state.avatar.get('HostList'))
  host_list = host_list.filter((host) => host.Address != action.host)
  host_list.unshift({ Address: action.host, UpdatedAt: timestamp })
  yield put({ type: actionType.avatar.setHostList, host_list: host_list })
  yield call(setStorageItem, 'HostList', host_list)
}

///////////////////////////////////////////////////////////////////////////////
// Bulletin
///////////////////////////////////////////////////////////////////////////////
export function* HandleBulletinRequest(action) {
  console.log(`===================================================================HandleBulletinRequest`)
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let json = action.json
  let self_address = yield select(state => state.avatar.get('Address'))
  let request_address = DeriveAddress(json.PublicKey)
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `SELECT * FROM BULLETINS WHERE address = "${json.Address}" AND sequence = ${json.Sequence} LIMIT 1`
  let item = yield call([db, db.getOne], sql)
  if (item != null) {
    let bulletin = JSON.parse(item.json)
    let msg = MessageGenerator.genObjectResponse(bulletin, request_address)
    yield put({ type: actionType.avatar.SendMessage, message: msg })
  } else if (json.Address == self_address && json.Sequence > 1) {
    // syn self bulletin from server
    sql = `SELECT * FROM BULLETINS WHERE address = "${self_address}" ORDER BY sequence DESC LIMIT 1`
    let last_bulletin = yield call([db, db.getOne], sql)
    let current_sequence = 0
    if (last_bulletin != null) {
      current_sequence = last_bulletin.sequence
    }
    if (current_sequence < json.Sequence - 1) {
      console.log(`syn self bulletin from server`)
      yield put({ type: actionType.avatar.FetchBulletin, address: self_address, sequence: current_sequence + 1, to: request_address })
    }
  }
}

export function* LoadCurrentBulletin(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `SELECT * FROM BULLETINS WHERE hash = "${action.hash}" LIMIT 1`
  let item = yield call([db, db.getOne], sql)
  if (item != null) {
    let bulletin = {
      "Address": item.address,
      "Timestamp": item.timestamp,
      "CreateAt": item.created_at,
      "Sequence": item.sequence,
      "Content": item.content,
      "Hash": item.hash,
      "QuoteSize": item.quote_size,
      "ViewAt": item.view_at,
      "IsCache": item.is_cache,
      "IsMark": item.is_mark,

      "PreHash": item.pre_hash,
      "QuoteList": []
    }
    if (bulletin.QuoteSize != 0) {
      let json = JSON.parse(item.json)
      bulletin.QuoteList = json.Quote
    }

    yield put({ type: actionType.avatar.setCurrentBulletin, bulletin: bulletin })
    sql = `UPDATE BULLETINS SET view_at = ${Date.now()} WHERE hash = "${action.hash}"`
    yield call([db, db.runSQL], sql)

    let quote_white_list = yield select(state => state.avatar.get('QuoteWhiteList'))
    for (const quote of bulletin.QuoteList) {
      if (!quote_white_list.includes(quote.Hash)) {
        quote_white_list.push(quote.Hash)
      }
    }
    quote_white_list = quote_white_list.filter((quote) => quote != bulletin.Hash)
    yield put({ type: actionType.avatar.setQuoteWhiteList, quote_white_list: quote_white_list })

    // reply
    sql = `SELECT * FROM QUOTES WHERE main_hash = "${bulletin.Hash}" ORDER BY signed_at ASC`
    let reply_list = yield call([db, db.getAll], sql)
    if (reply_list.length > 0) {
      yield put({ type: actionType.avatar.setReplyList, reply_list: reply_list })
    } else {
      yield put({ type: actionType.avatar.setReplyList, reply_list: [] })
    }
  } else {
    //fetch from network
    //action[address, sequence, to]
    yield put({ type: actionType.avatar.setCurrentBulletin, bulletin: null })
    yield put({ type: actionType.avatar.FetchBulletin, address: action.address, sequence: action.sequence, to: action.to })
  }
}

export function* clearBulletinCache() {
  let db = yield select(state => state.avatar.get('Database'))
  let follow_list = yield select(state => state.avatar.get('Follows'))
  let address_list = Array2Str(follow_list)
  let sql = `DELETE FROM BULLETINS WHERE is_mark = "FALSE"`
  if (address_list != "") {
    sql = `DELETE FROM BULLETINS WHERE is_mark = "FALSE" AND address NOT IN (${address_list})`
  }
  yield call([db, db.runSQL], sql)

  // delete quote
  sql = `DELETE FROM QUOTES`
  if (address_list != "") {
    sql = `DELETE FROM BULLETINS WHERE address NOT IN (${address_list})`
  }
  yield call([db, db.runSQL], sql)
}

export function* PublishBulletin(action) {
  console.log(`=================================================PublishBulletin`)
  let address = yield select(state => state.avatar.get('Address'))
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `SELECT * FROM BULLETINS WHERE address = "${address}" ORDER BY sequence DESC LIMIT 1`
  let last_bulletin = yield call([db, db.getOne], sql)
  let pre_hash = GenesisHash
  let next_sequence = 1
  if (last_bulletin != null) {
    pre_hash = last_bulletin.hash
    next_sequence = last_bulletin.sequence + 1
  }
  let quote_list = yield select(state => state.avatar.get('QuoteList'))
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let timestamp = Date.now()
  let bulletin_json = MessageGenerator.genBulletinJson(next_sequence, pre_hash, quote_list, action.content, timestamp)
  let str_bulletin = JSON.stringify(bulletin_json)
  let hash = quarterSHA512(str_bulletin)
  let is_file = false
  let file_saved = false
  sql = `INSERT INTO BULLETINS (address, sequence, pre_hash, content, timestamp, json, created_at, hash, quote_size, is_file, file_saved, relay_address, is_cache)
VALUES ('${address}', ${next_sequence}, '${bulletin_json.PreHash}', '${bulletin_json.Content}', '${bulletin_json.Timestamp}', '${str_bulletin}', ${timestamp}, '${hash}', ${bulletin_json.Quote.length}, '${is_file}', '${file_saved}', '${address}', 'FALSE')`
  yield call([db, db.runSQL], sql)
  let bulletin = {
    "Address": address,
    "Timestamp": bulletin_json.Timestamp,
    "CreatedAt": timestamp,
    'Sequence': bulletin_json.Sequence,
    "Content": bulletin_json.Content,
    "Hash": hash,
    "QuoteSize": bulletin_json.Quote.length,
    "IsMark": false
  }
  //刷新TabBulletin页
  let tab_bulletin_list = yield select(state => state.avatar.get('TabBulletinList'))
  tab_bulletin_list.unshift(bulletin)
  yield put({ type: actionType.avatar.setTabBulletinList, tab_bulletin_list: tab_bulletin_list })

  yield put({ type: actionType.avatar.setQuoteList, quote_list: [] })

  let msg = MessageGenerator.genObjectResponse(bulletin_json, address)
  yield put({ type: actionType.avatar.SendMessage, message: msg })
}

export function* SaveBulletinDraft(action) {
  console.log(`=================================================SaveBulletinDraft`)
  let self_address = yield select(state => state.avatar.get('Address'))
  try {
    AsyncStorage.setItem(`${self_address}#draft`, action.draft).then(() => {
    })
  } catch (e) {
    console.log(e)
  }
}

export function* SaveQuote(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let quoter_address = action.quoter_address
  let quoter_sequence = action.quoter_sequence
  let quoter_hash = action.quoter_hash
  let quoter_content = action.quoter_content
  let quoter_timestamp = action.quoter_timestamp
  let main_list = action.main_list

  for (let index = 0; index < main_list.length; index++) {
    const main = main_list[index];
    sql = `INSERT INTO QUOTES (main_hash, address, sequence, quote_hash, content, signed_at)
  VALUES ('${main.Hash}', '${quoter_address}', ${quoter_sequence}, '${quoter_hash}', '${quoter_content}', '${quoter_timestamp}')`
    yield call([db, db.runSQL], sql)
  }
}

export function* SaveBulletin(action) {
  let bulletin_json = action.bulletin_json
  let relay_address = action.relay_address

  let object_address = DeriveAddress(bulletin_json.PublicKey)
  let strJson = JSON.stringify(bulletin_json)
  let hash = quarterSHA512(strJson)

  if (VerifyJsonSignature(bulletin_json) == true) {
    bulletin_json.Address = object_address
    let timestamp = Date.now()
    let db = yield select(state => state.avatar.get('Database'))
    let self_address = yield select(state => state.avatar.get('Address'))
    let follow_list = yield select(state => state.avatar.get('Follows'))
    let quote_white_list = yield select(state => state.avatar.get('QuoteWhiteList'))
    let message_white_list = yield select(state => state.avatar.get('MessageWhiteList'))

    let random_bulletin_flag = yield select(state => state.avatar.get('RandomBulletinFlag'))

    // console.log(quote_white_list)

    //check is_file?
    let is_file = false
    let file_saved = false
    let fileJson = null
    let fileSHA1 = null

    //WTF:is_file = 'false', not is_file = false

    let sql = `SELECT * FROM BULLETINS WHERE address = "${object_address}" AND sequence = ${bulletin_json.Sequence} LIMIT 1`
    let bulletin = yield call([db, db.getOne], sql)
    if (bulletin != null) {
      // 已经保存了
      if (follow_list.includes(object_address)) {
        yield put({ type: actionType.avatar.FetchBulletin, address: object_address, sequence: bulletin_json.Sequence + 1, to: object_address })
      } else if (quote_white_list.includes(hash) || message_white_list.includes(hash)) {
        let current_bulletin = yield select(state => state.avatar.get('CurrentBulletin'))
        if (current_bulletin == null) {
          yield put({ type: actionType.avatar.setCurrentBulletin, bulletin: bulletin_json })
        }
      } else if (self_address == object_address) {
        yield put({ type: actionType.avatar.FetchBulletin, address: object_address, sequence: bulletin_json.Sequence + 1, to: object_address })
      } else if (random_bulletin_flag) {
        yield put({ type: actionType.avatar.setRandomBulletin, bulletin: bulletin_json })
        yield put({ type: actionType.avatar.setRandomBulletinFlag, flag: false })
      }
    } else {
      if (follow_list.includes(object_address)) {
        //bulletin from follow
        sql = `INSERT INTO BULLETINS (address, sequence, pre_hash, content, timestamp, json, created_at, hash, quote_size, is_file, file_saved, relay_address, is_cache)
        VALUES ('${object_address}', ${bulletin_json.Sequence}, '${bulletin_json.PreHash}', '${bulletin_json.Content}', '${bulletin_json.Timestamp}', '${strJson}', ${timestamp}, '${hash}', ${bulletin_json.Quote.length}, '${is_file}', '${file_saved}', '${relay_address}', 'FALSE')`

        //save bulletin
        yield call([db, db.runSQL], sql)
        let bulletin = {
          "Address": object_address,
          "Timestamp": bulletin_json.Timestamp,
          "CreatedAt": timestamp,
          'Sequence': bulletin_json.Sequence,
          "Content": bulletin_json.Content,
          "Hash": hash,
          "QuoteSize": bulletin_json.Quote.length,
          "IsMark": false
        }
        //刷新TabBulletin页
        let tab_bulletin_list = yield select(state => state.avatar.get('TabBulletinList'))
        tab_bulletin_list.unshift(bulletin)
        yield put({ type: actionType.avatar.setTabBulletinList, tab_bulletin_list: tab_bulletin_list })

        let current_BB_session = yield select(state => state.avatar.get('CurrentBBSession'))
        if (current_BB_session == object_address) {
          let bulletin_list = yield select(state => state.avatar.get('BulletinList'))
          // 刷新FollowBulletinList页
          bulletin_list.unshift(bulletin)
          yield put({ type: actionType.avatar.setBulletinList, bulletin_list: bulletin_list })
        }
        yield put({ type: actionType.avatar.FetchBulletin, address: object_address, sequence: bulletin_json.Sequence + 1, to: object_address })

        // save quote
        if (bulletin_json.Quote.length > 0) {
          yield put({
            type: actionType.avatar.SaveQuote,
            quoter_address: object_address,
            quoter_sequence: bulletin_json.Sequence,
            quoter_hash: hash,
            quoter_content: bulletin_json.Content,
            quoter_timestamp: bulletin_json.Timestamp,
            main_list: bulletin_json.Quote
          })
        }
      } else if (quote_white_list.includes(hash) || message_white_list.includes(hash)) {
        //bulletin from quote
        sql = `INSERT INTO BULLETINS (address, sequence, pre_hash, content, timestamp, json, created_at, hash, quote_size, is_file, file_saved, relay_address, is_cache)
        VALUES ('${object_address}', ${bulletin_json.Sequence}, '${bulletin_json.PreHash}', '${bulletin_json.Content}', '${bulletin_json.Timestamp}', '${strJson}', ${timestamp}, '${hash}', ${bulletin_json.Quote.length}, '${is_file}', '${file_saved}', '${relay_address}', 'TRUE')`

        //save bulletin
        yield call([db, db.runSQL], sql)
        let current_bulletin = yield select(state => state.avatar.get('CurrentBulletin'))
        if (current_bulletin == null) {
          yield put({ type: actionType.avatar.setCurrentBulletin, bulletin: bulletin_json })
        }
        // } else if (message_white_list.includes(hash)) {
        //   //bulletin from message
        //   sql = `INSERT INTO BULLETINS (address, sequence, pre_hash, content, timestamp, json, created_at, hash, quote_size, is_file, file_saved, relay_address, is_cache)
        // VALUES ('${object_address}', ${bulletin_json.Sequence}, '${bulletin_json.PreHash}', '${bulletin_json.Content}', '${bulletin_json.Timestamp}', '${strJson}', ${timestamp}, '${hash}', ${bulletin_json.Quote.length}, '${is_file}', '${file_saved}', '${relay_address}', 'TRUE')`

        //   //save bulletin
        //   yield call([db, db.runSQL], sql)
        //   let current_bulletin = yield select(state => state.avatar.get('CurrentBulletin'))
        //   if (current_bulletin == null) {
        //     yield put({ type: actionType.avatar.setCurrentBulletin, bulletin: bulletin_json })
        //   }
      } else if (self_address == object_address) {
        //bulletin from myself
        sql = `INSERT INTO BULLETINS (address, sequence, pre_hash, content, timestamp, json, created_at, hash, quote_size, is_file, file_saved, relay_address, is_cache)
        VALUES ('${object_address}', ${bulletin_json.Sequence}, '${bulletin_json.PreHash}', '${bulletin_json.Content}', '${bulletin_json.Timestamp}', '${strJson}', ${timestamp}, '${hash}', ${bulletin_json.Quote.length}, '${is_file}', '${file_saved}', '${relay_address}', 'TRUE')`
        //save bulletin
        yield call([db, db.runSQL], sql)

        // save quote
        if (bulletin_json.Quote.length > 0) {
          yield put({
            type: actionType.avatar.SaveQuote,
            quoter_address: object_address,
            quoter_sequence: bulletin_json.Sequence,
            quoter_hash: hash,
            quoter_content: bulletin_json.Content,
            quoter_timestamp: bulletin_json.Timestamp,
            main_list: bulletin_json.Quote
          })
        }

        yield put({ type: actionType.avatar.FetchBulletin, address: object_address, sequence: bulletin_json.Sequence + 1, to: object_address })
      } else if (random_bulletin_flag) {
        //bulletin from random
        sql = `INSERT INTO BULLETINS (address, sequence, pre_hash, content, timestamp, json, created_at, hash, quote_size, is_file, file_saved, relay_address, is_cache)
        VALUES ('${object_address}', ${bulletin_json.Sequence}, '${bulletin_json.PreHash}', '${bulletin_json.Content}', '${bulletin_json.Timestamp}', '${strJson}', ${timestamp}, '${hash}', ${bulletin_json.Quote.length}, '${is_file}', '${file_saved}', '${relay_address}', 'TRUE')`
        //save bulletin
        yield call([db, db.runSQL], sql)

        // save quote
        if (bulletin_json.Quote.length > 0) {
          yield put({
            type: actionType.avatar.SaveQuote,
            quoter_address: object_address,
            quoter_sequence: bulletin_json.Sequence,
            quoter_hash: hash,
            quoter_content: bulletin_json.Content,
            quoter_timestamp: bulletin_json.Timestamp,
            main_list: bulletin_json.Quote
          })
        }

        bulletin_json.Hash = hash
        yield put({ type: actionType.avatar.setRandomBulletin, bulletin: bulletin_json })
        yield put({ type: actionType.avatar.setRandomBulletinFlag, flag: false })
      }

      // remove the oldest cache
      let bulletin_cache_size = yield select(state => state.avatar.get('BulletinCacheSize'))
      if (bulletin_cache_size != 0) {
        yield put({ type: actionType.avatar.removeBulletinCache, bulletin_cache_size: bulletin_cache_size })
      }
    }
  }
}

export function* LoadTabBulletinList(action) {
  let self_address = yield select(state => state.avatar.get('Address'))
  let db = yield select(state => state.avatar.get('Database'))
  let sql = ''
  let bulletin_list = []

  // bulletin_list_flag?新的列表：列表增加本地数据
  if (action.bulletin_list_flag == true) {
    // 先置空列表
    yield put({ type: actionType.avatar.setTabBulletinList, tab_bulletin_list: [] })
  } else {
    // 当前列表
    bulletin_list = yield select(state => state.avatar.get('TabBulletinList'))
  }
  let bulletin_list_size = bulletin_list.length

  let follow_list = yield select(state => state.avatar.get('Follows'))
  let address_list = []
  follow_list.forEach(follow => {
    address_list.push(follow)
  })
  address_list.push(self_address)
  sql = `SELECT * FROM BULLETINS WHERE address IN (${Array2Str(address_list)}) ORDER BY timestamp DESC LIMIT ${BulletinPageSize} OFFSET ${bulletin_list_size}`
  let tmp = []
  let items = yield call([db, db.getAll], sql)
  items.forEach(bulletin => {
    tmp.push({
      "Address": bulletin.address,
      "Timestamp": bulletin.timestamp,
      "CreateAt": bulletin.created_at,
      "Sequence": bulletin.sequence,
      "Content": bulletin.content,
      "Hash": bulletin.hash,
      "QuoteSize": bulletin.quote_size,
      "IsMark": bulletin.is_mark
    })
  })
  if (tmp.length != 0) {
    bulletin_list = bulletin_list.concat(tmp)
    yield put({ type: actionType.avatar.setTabBulletinList, tab_bulletin_list: bulletin_list })
  }

  // 获取更新
  // yield put({ type: actionType.avatar.UpdateFollowBulletin })
}

export function* LoadBulletinList(action) {
  let self_address = yield select(state => state.avatar.get('Address'))
  let db = yield select(state => state.avatar.get('Database'))
  let sql = ''
  let bulletin_list = []

  // bulletin_list_flag?新的列表：列表增加本地数据
  if (action.bulletin_list_flag == true) {
    yield put({ type: actionType.avatar.setBulletinList, bulletin_list: [] })
  } else {
    bulletin_list = yield select(state => state.avatar.get('BulletinList'))
  }
  let bulletin_list_size = bulletin_list.length

  if (action.session == BulletinAddressSession) {
    // 显示本地数据
    yield put({ type: actionType.avatar.setCurrentBBSession, current_BB_session: action.address })
    sql = `SELECT * FROM BULLETINS WHERE address = '${action.address}' ORDER BY sequence DESC LIMIT ${BulletinPageSize} OFFSET ${bulletin_list_size}`
    // 获取更新
    // 甚至是自己的公告，为切换设备后从服务器取回历史公告 && action.address != self_address
    let next_sequence = 1
    let sql2 = `SELECT sequence FROM BULLETINS WHERE address = '${action.address}' ORDER BY sequence DESC`
    let sequence_list = yield call([db, db.getAll], sql2)
    let length = sequence_list.length
    if (length == 0 || sequence_list[length - 1]['sequence'] != 1) {
      // 本地没有缓存 || 缓存最小不是1
    } else if (length == sequence_list[0]['sequence']) {
      // 缓存数量 == 最大编号
      next_sequence = sequence_list[0]['sequence'] + 1
    } else {
      // 先定位未缓存的最小编号
      let tmp = 0
      while (sequence_list.length > 0) {
        if (tmp + 1 == sequence_list.pop()) {
          tmp = tmp + 1
        } else {
          break
        }
      }
      next_sequence = tmp + 1
    }
    if (action.address != self_address) {
      yield put({ type: actionType.avatar.FetchBulletin, address: action.address, sequence: next_sequence, to: action.address })
    } else {
      yield put({ type: actionType.avatar.FetchBulletin, address: action.address, sequence: next_sequence, to: GenesisAddress })
    }
  } else if (action.session == BulletinHistorySession) {
    sql = `SELECT * FROM BULLETINS ORDER BY view_at DESC LIMIT ${BulletinPageSize} OFFSET ${bulletin_list_size}`
  } else if (action.session == BulletinMarkSession) {
    sql = `SELECT * FROM BULLETINS WHERE is_mark = 'TRUE' ORDER BY mark_at DESC LIMIT ${BulletinPageSize} OFFSET ${bulletin_list_size}`
  }

  let tmp = []
  let items = yield call([db, db.getAll], sql)
  items.forEach(bulletin => {
    tmp.push({
      "Address": bulletin.address,
      "Timestamp": bulletin.timestamp,
      "CreateAt": bulletin.created_at,
      "Sequence": bulletin.sequence,
      "Content": bulletin.content,
      "Hash": bulletin.hash,
      "QuoteSize": bulletin.quote_size,
      "IsMark": bulletin.is_mark
    })
  })
  if (tmp.length != 0) {
    bulletin_list = bulletin_list.concat(tmp)
    yield put({ type: actionType.avatar.setBulletinList, bulletin_list: bulletin_list })
  }
}

export function* UpdateFollowBulletin() {
  console.log(`=================================================UpdateFollowBulletin`)
  let db = yield select(state => state.avatar.get('Database'))
  let follow_list = yield select(state => state.avatar.get('Follows'))
  let sql = `SELECT * FROM BULLETINS GROUP BY address`
  let bulletin_list = []
  let items = yield call([db, db.getAll], sql)
  items.forEach(bulletin => {
    if (follow_list.includes(bulletin.address)) {
      bulletin_list.push({
        "Address": bulletin.address,
        'Sequence': bulletin.sequence
      })
    }
  })

  let address_next_sequence = {}
  //set next sequence to 1
  for (let i = follow_list.length - 1; i >= 0; i--) {
    address_next_sequence[follow_list[i]] = 1
  }
  //update next sequenece by db
  for (let i = bulletin_list.length - 1; i >= 0; i--) {
    if (address_next_sequence[bulletin_list[i].Address] <= bulletin_list[i].Sequence) {
      address_next_sequence[bulletin_list[i].Address] = bulletin_list[i].Sequence + 1
    }
  }
  //fetch next bulletin
  for (let i = follow_list.length - 1; i >= 0; i--) {
    yield put({ type: actionType.avatar.FetchBulletin, address: follow_list[i], sequence: address_next_sequence[follow_list[i]], to: follow_list[i] })
  }

  //fetch self next bulletin
  let self_address = yield select(state => state.avatar.get('Address'))
  sql = `SELECT * FROM BULLETINS WHERE address = "${self_address}" ORDER BY sequence DESC LIMIT 1`
  let last_bulletin = yield call([db, db.getOne], sql)
  let current_sequence = 0
  if (last_bulletin != null) {
    current_sequence = last_bulletin.sequence
  }
  yield put({ type: actionType.avatar.FetchBulletin, address: self_address, sequence: current_sequence + 1, to: GenesisAddress })
}

export function* FetchBulletin(action) {
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let msg = MessageGenerator.genBulletinRequest(action.address, action.sequence, action.to)
  yield put({ type: actionType.avatar.SendMessage, message: msg })
}

export function* FetchRandomBulletin() {
  // let address = yield select(state => state.avatar.get('Address'))
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let msg = MessageGenerator.genBulletinRandom()
  yield put({ type: actionType.avatar.SendMessage, message: msg })
}

export function* FetchBulletinAddressList(action) {
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let msg = MessageGenerator.genBulletinAddressListRequest(action.page)
  console.log(msg)
  yield put({ type: actionType.avatar.SendMessage, message: msg })
}

export function* FetchBulletinReplyList(action) {
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let msg = MessageGenerator.genBulletinReplyListRequest(action.hash, action.page)
  yield put({ type: actionType.avatar.SendMessage, message: msg })
}

export function* MarkBulletin(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `UPDATE BULLETINS SET is_mark = "TRUE", mark_at = ${Date.now()} WHERE hash = "${action.hash}"`
  yield call([db, db.runSQL], sql)
  yield put({ type: actionType.avatar.LoadCurrentBulletin, hash: action.hash })
}

export function* UnmarkBulletin(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `UPDATE BULLETINS SET is_mark = "FALSE" WHERE hash = "${action.hash}"`
  yield call([db, db.runSQL], sql)
  yield put({ type: actionType.avatar.LoadCurrentBulletin, hash: action.hash })
}

///////////////////////////////////////////////////////////////////////////////
// Chat
///////////////////////////////////////////////////////////////////////////////
export function* LoadCurrentSession(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let address = action.address
  let timestamp = Date.now()
  let self_address = yield select(state => state.avatar.get('Address'))
  let ecdh_sequence = DHSequence(DefaultPartition, timestamp, self_address, address)

  //fetch aes-Key according to (address+partition+sequence)
  let sql = `SELECT * FROM ECDHS WHERE address = "${address}" AND partition = "${DefaultPartition}" AND sequence = ${ecdh_sequence}`
  let ecdh = yield call([db, db.getOne], sql)
  if (ecdh != null) {
    if (ecdh.aes_key != null) {
      //aes ready
      yield put({ type: actionType.avatar.setCurrentSessionAesKey, address: address, ecdh_sequence: ecdh_sequence, aes_key: ecdh.aes_key })
      //handsake already done, ready to chat
    } else {
      //my-sk-pk exist, aes not ready
      //send self-not-ready-json
      yield put({ type: actionType.avatar.SendMessage, message: ecdh.self_json })
    }
  } else {
    //my-sk-pk not exist
    //gen my-sk-pk
    let ecdh = crypto.createECDH('secp256k1')
    let ecdh_pk = ecdh.generateKeys('hex')
    let ecdh_sk = ecdh.getPrivateKey('hex')
    let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
    let msg = MessageGenerator.genFriendECDHRequest(DefaultPartition, ecdh_sequence, ecdh_pk, "", address, timestamp)
    // console.log(msg)

    //save my-sk-pk, self-not-ready-json
    let sql = `INSERT INTO ECDHS (address, partition, sequence, private_key, self_json)
      VALUES ('${address}', '${DefaultPartition}', ${ecdh_sequence}, '${ecdh_sk}', '${msg}')`
    let reuslt = yield call([db, db.runSQL], sql)
    // {"insertId": 1, "rows": {"item": [Function item], "length": 0, "raw": [Function raw]}, "rowsAffected": 1}
    // {"code": 0, "message": "UNIQUE constraint failed: ECDHS.address, ECDHS.partition, ECDHS.sequence (code 1555 sqlITE_CONSTRAINT_PRIMARYKEY)"}
    if (reuslt.code != 0) {
      yield put({ type: actionType.avatar.SendMessage, message: msg })
    }
  }

  // setCurrentSession
  sql = `SELECT * FROM MESSAGES WHERE dest_address = "${address}" ORDER BY sequence DESC`
  let last_message = yield call([db, db.getOne], sql)
  let current_sequence = 0
  let current_hash = GenesisHash
  if (last_message != null) {
    current_sequence = last_message.sequence
    current_hash = last_message.hash
  }
  yield put({ type: actionType.avatar.setCurrentSession, address: address, hash: current_hash, sequence: current_sequence })
}

export function* LoadCurrentMessageList(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let message_list = []

  // init_flag?新的列表：延长列表
  if (action.init_flag == true) {
    // 新的列表
    yield put({ type: actionType.avatar.setCurrentMessageList, message_list: [] })

    // 该session未读清零
    let session_map = yield select(state => state.avatar.get('SessionMap'))
    session_map[action.address].CountUnread = 0
    yield put({ type: actionType.avatar.setSessionMap, session_map: session_map })

    //fetch more message
    let sql = `SELECT * FROM MESSAGES WHERE sour_address = "${action.address}" ORDER BY sequence DESC`
    let last_message = yield call([db, db.getOne], sql)
    let last_sequence = 0
    if (last_message != null) {
      last_sequence = last_message.sequence
    }
    let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
    let msg = MessageGenerator.genFriendSync(last_sequence, action.address)
    yield put({ type: actionType.avatar.SendMessage, message: msg })
  } else {
    // 延长列表
    message_list = yield select(state => state.avatar.get('CurrentMessageList'))
  }
  let message_list_size = message_list.length
  let message_white_list = yield select(state => state.avatar.get('MessageWhiteList'))

  let sql = `SELECT * FROM MESSAGES WHERE sour_address = '${action.address}' OR dest_address = '${action.address}' ORDER BY timestamp DESC LIMIT ${MessagePageSize} OFFSET ${message_list_size}`
  let items = yield call([db, db.getAll], sql)
  let tmp = []
  items.forEach(item => {
    let confirmed = (item.confirmed == "TRUE")
    let is_object = (item.is_object == "TRUE")
    let object_json = {}
    if (is_object == true) {
      object_json = JSON.parse(item.content)
      if (object_json.ObjectType == 'Bulletin' && !message_white_list.includes(object_json.Hash)) {
        message_white_list.push(object_json.Hash)
      }
    }
    tmp.unshift({
      "SourAddress": item.sour_address,
      "Timestamp": item.timestamp,
      "Sequence": item.sequence,
      "CreatedAt": item.created_at,
      "Content": item.content,
      "Confirmed": confirmed,
      "Hash": item.hash,
      "IsObject": is_object,
      "ObjectJson": object_json
    })
  })
  if (tmp.length != 0) {
    message_list = tmp.concat(message_list)
    yield put({ type: actionType.avatar.setCurrentMessageList, message_list: message_list })
    yield put({ type: actionType.avatar.setMessageWhiteList, message_white_list: message_white_list })
  }
}

export function* LoadMsgInfo(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let sql = `SELECT * FROM MESSAGES WHERE hash = "${action.hash}" LIMIT 1`
  let item = yield call([db, db.getOne], sql)
  if (item != null) {
    let json = JSON.parse(item.json)
    let msg_info = {
      "SourAddress": item.sour_address,
      "DestAddress": item.dest_address,
      "Timestamp": item.timestamp,
      "CreatedAt": item.created_at,
      "Sequence": item.sequence,

      "Content": json.Content,
      "PairHash": json.PairHash
    }

    yield put({ type: actionType.avatar.setMsgInfo, msg_info: msg_info })
  } else {
    // never go here
  }
}

export function* HandleFriendECDH(action) {
  let json = action.json
  //check message from my friend
  let address = DeriveAddress(json.PublicKey)
  let timestamp = Date.now()
  let db = yield select(state => state.avatar.get('Database'))
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let friend_list = yield select(state => state.avatar.get('Friends'))
  if (!friend_list.includes(address)) {
    console.log('message is not from my friend...')
    //Strangers
    let sql = `SELECT * FROM FRIEND_REQUESTS WHERE address = "${address}"`
    let item = yield call([db, db.getOne], sql)
    let result = { code: 0 }
    if (item != null) {
      sql = `UPDATE FRIEND_REQUESTS SET updated_at = ${timestamp} WHERE address = "${address}"`
      result = yield call([db, db.runSQL], sql)
    } else {
      sql = `INSERT INTO FRIEND_REQUESTS (address, updated_at)
        VALUES ('${address}', ${timestamp})`
      result = yield call([db, db.runSQL], sql)
    }
    if (result && result.code != 0) {
      let friend_request_list = yield select(state => state.avatar.get('FriendRequests'))
      friend_request_list.unshift({ Address: address, Timestamp: timestamp })
      yield put({ type: actionType.avatar.setFriendRequests, friend_request_list: friend_request_list })
    }
  } else {
    //check dh(my-sk-pk pair-pk aes-key)

    let sql = `SELECT * FROM ECDHS WHERE address = "${address}" AND partition = "${json.Partition}" AND sequence = ${json.Sequence}`
    let item = yield call([db, db.getOne], sql)

    if (item == null) {
      //self not ready, so pair could not be ready
      //gen my-sk-pk and aes-key
      let ecdh = crypto.createECDH('secp256k1')
      let ecdh_pk = ecdh.generateKeys('hex')
      let ecdh_sk = ecdh.getPrivateKey('hex')
      let aes_key = ecdh.computeSecret(json.DHPublicKey, 'hex', 'hex')

      //gen message with my-pk, indicate self ready
      let msg = MessageGenerator.genFriendECDHRequest(json.Partition, json.Sequence, ecdh_pk, json.DHPublicKey, address, timestamp)

      //save my-sk-pk, pair-pk, aes-key, self-not-ready-json
      sql = `INSERT INTO ECDHS (address, partition, sequence, private_key, public_key, aes_key, self_json)
        VALUES ('${address}', '${json.Partition}', '${json.Sequence}', '${ecdh_sk}', '${json.DHPublicKey}', '${aes_key}', '${msg}')`
      let reuslt = yield call([db, db.runSQL], sql)
      if (reuslt.code != 0) {
        yield put({ type: actionType.avatar.SendMessage, message: msg })
      }
    } else if (item.pair_json == null) {
      //item not null => my-sk-pk, self-not-ready-json is exist
      //gen aes
      let ecdh = crypto.createECDH('secp256k1')
      ecdh.setPrivateKey(item.private_key, 'hex')
      let ecdh_pk = ecdh.getPublicKey('hex')
      let aes_key = ecdh.computeSecret(json.DHPublicKey, 'hex', 'hex')

      //gen self-ready-json
      let msg = MessageGenerator.genFriendECDHRequest(json.Partition, json.Sequence, ecdh_pk, json.DHPublicKey, address, timestamp)

      if (json.Pair == "") {
        //pair not ready
        //save pair-pk, aes-key, self-ready-json
        sql = `UPDATE ECDHS SET public_key = '${json.DHPublicKey}', aes_key = '${aes_key}', self_json = '${msg}' WHERE address = "${address}" AND partition = "${json.Partition}" AND sequence = "${json.Sequence}"`
      } else {
        //pair ready
        //save pair-pk, aes-key, self-ready-json, pair-ready-json
        sql = `UPDATE ECDHS SET public_key = '${json.DHPublicKey}', aes_key = '${aes_key}', self_json = '${msg}', pair_json = '${JSON.stringify(json)}' WHERE address = "${address}" AND partition = "${json.Partition}" AND sequence = "${json.Sequence}"`
      }
      let reuslt = yield call([db, db.runSQL], sql)

      if (reuslt.code != 0) {
        yield put({ type: actionType.avatar.SendMessage, message: msg })
        let current_session_aes_key = yield select(state => state.avatar.get('CurrentSessionAesKey'))
        if (address == current_session_aes_key.Address) {
          yield put({ type: actionType.avatar.setCurrentSessionAesKey, address: address, ecdh_sequence: json.Sequence, aes_key: aes_key })
        }
      }
    }
    //else: self and pair are ready, do nothing
    //both ready to talk
  }
}

export function* HandleFriendMessage(action) {
  let json = action.json
  let sour_address = DeriveAddress(json.PublicKey)
  let db = yield select(state => state.avatar.get('Database'))
  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  //check message from my friend
  let friend_list = yield select(state => state.avatar.get('Friends'))
  if (!friend_list.includes(sour_address)) {
    // console.log('message is not from my friend...')
    return
  }

  //check pre-message
  let sql = `SELECT * FROM MESSAGES WHERE sour_address = "${sour_address}" AND hash = "${json.PreHash}" AND sequence = ${json.Sequence - 1}`
  let item = yield call([db, db.getOne], sql)
  if (item == null) {
    if (json.Sequence == 1) {
      yield put({ type: actionType.avatar.SaveFriendMessage, sour_address: sour_address, json: json })
    } else {
      // //some message is missing
      // //get last message(biggest sequence)
      // sql = `SELECT * FROM MESSAGES WHERE sour_address = "${sour_address}" ORDER BY sequence DESC`
      // item = yield call([db, db.getOne], sql)
      // //send ChatSync
      // let current_sequence = 0
      // if (item != null) {
      //   current_sequence = item.sequence
      // }
      // let msg = MessageGenerator.genFriendSync(current_sequence, sour_address)
      // yield put({ type: actionType.avatar.SendMessage, message: msg })
    }
  } else {
    //pre-message exist
    yield put({ type: actionType.avatar.SaveFriendMessage, sour_address: sour_address, json: json })
  }
}

export function* SaveFriendMessage(action) {
  let db = yield select(state => state.avatar.get('Database'))
  let session_map = yield select(state => state.avatar.get('SessionMap'))
  let sour_address = action.sour_address
  let json = action.json

  let self_address = yield select(state => state.avatar.get('Address'))
  let sequence = DHSequence(DefaultPartition, json.Timestamp, self_address, sour_address)
  //fetch chatkey(aes_key) to decrypt content
  let sql = `SELECT * FROM ECDHS WHERE address = "${sour_address}" AND partition = "${DefaultPartition}" AND sequence = ${sequence}`
  let item = yield call([db, db.getOne], sql)
  if (item == null && item.aes_key == null) {
    console.log('chatkey not exist...')
  } else {
    //decrypt content
    let content = AesDecrypt(json.Content, item.aes_key)

    let strJson = JSON.stringify(json)
    let hash = quarterSHA512(strJson)
    let created_at = Date.now()

    let readed = 'FALSE'
    let current_session = yield select(state => state.avatar.get('CurrentSession'))
    if (current_session && sour_address == current_session.Address) {
      readed = 'TRUE'
    }

    //check is_file?
    let is_file = 'FALSE'
    let file_saved = 'FALSE'
    let fileJson = null
    let fileSHA1 = null

    // Parse Object Json
    let is_object = 'FALSE'
    let object_type = ''
    let object_json = {}
    try {
      object_json = JSON.parse(content)
      if (checkObjectSchema(object_json)) {
        is_object = 'TRUE'
        object_type = object_json.ObjectType
      }
    } catch (e) {
    }

    //save message
    let sql = `INSERT INTO MESSAGES (sour_address, sequence, pre_hash, content, timestamp, json, hash, created_at, readed, is_file, file_saved, file_sha1, is_object, object_type)
      VALUES ('${sour_address}', ${json.Sequence}, '${json.PreHash}', '${content}', '${json.Timestamp}', '${strJson}', '${hash}', '${created_at}', '${readed}', '${is_file}', '${file_saved}', '${fileSHA1}', '${is_object}', '${object_type}')`

    let reuslt = yield call([db, db.runSQL], sql)
    if (reuslt.code != 0) {
      if (current_session && sour_address == current_session.Address) {
        //CurrentSession: show message
        let message_list = yield select(state => state.avatar.get('CurrentMessageList'))
        message_list.push({
          "SourAddress": sour_address,
          "Timestamp": json.Timestamp,
          "Sequence": json.Sequence,
          "CreatedAt": created_at,
          "Content": content,
          "Confirmed": false,
          "Hash": hash,
          "IsObject": (is_object == "TRUE"),
          "ObjectJson": object_json
        })
        yield put({ type: actionType.avatar.setCurrentMessageList, message_list: message_list })
      } else {
        //not CurrentSession: update unread_count
        session_map[sour_address].CountUnread += 1
      }

      session_map[sour_address].Timestamp = json.Timestamp
      session_map[sour_address].Content = content
      yield put({ type: actionType.avatar.setSessionMap, session_map: session_map })

      //update db-message(confirmed)
      sql = `UPDATE MESSAGES SET confirmed = 'TRUE' WHERE dest_address = '${sour_address}' AND hash IN (${Array2Str(json.PairHash)})`
      reuslt = yield call([db, db.runSQL], sql)
      if (reuslt.code != 0) {
        //update view-message(confirmed)
        if (current_session && sour_address == current_session.Address) {
          let message_list = yield select(state => state.avatar.get('CurrentMessageList'))
          for (let i = message_list.length - 1; i >= 0; i--) {
            if (json.PairHash.includes(message_list[i].Hash)) {
              message_list[i].Confirmed = true
            }
          }
          yield put({ type: actionType.avatar.setCurrentMessageList, message_list: message_list })
        }
      }
    }


    // try {
    //   fileJson = JSON.parse(content)
    //   //is a json
    //   if (checkFileSchema(fileJson)) {
    //     //is a file json
    //     is_file = true
    //     fileSHA1 = fileJson["SHA1"]
    //     let filesql = `SELECT * FROM FILES WHERE sha1 = "${fileJson.SHA1}" AND saved = true`
    //     state.DB.get(filesql, (err, item) => {
    //       if (err) {
    //         console.log(err)
    //       } else {
    //         if (item != null) {
    //           file_saved = true
    //         }
    //         //update sql
    //         sql = `INSERT INTO MESSAGES (sour_address, sequence, pre_hash, content, timestamp, json, hash, created_at, readed, is_file, file_saved, file_sha1)
    //           VALUES ('${sour_address}', ${json.Sequence}, '${json.PreHash}', '${content}', '${json.Timestamp}', '${strJson}', '${hash}', '${created_at}', ${readed}, ${is_file}, ${file_saved}, '${fileSHA1}')`
    //       }
    //     })
    //   }
    // } catch (e) {
    //   console.log(e)
    // }
  }
}

export function* HandleChatSyncFromFriend(action) {
  let json = action.json

  let sour_address = DeriveAddress(json.PublicKey)
  //check message from my friend
  let friend_list = yield select(state => state.avatar.get('Friends'))
  if (!friend_list.includes(sour_address)) {
    // console.log('message is not from my friend...')
    return
  }

  let db = yield select(state => state.avatar.get('Database'))
  let sql = `SELECT * FROM MESSAGES WHERE dest_address = "${sour_address}" AND confirmed = 'FALSE' AND sequence > ${json.CurrentSequence} ORDER BY sequence ASC`
  let items = yield call([db, db.getAll], sql)
  let s = 0
  for (let i = 0; i < items.length; i++) {
    yield call(DelayExec, s * 1000)
    yield put({ type: actionType.avatar.SendMessage, message: items[i].json })
    s = s + 1
  }
}

export function* HandleChatSyncFromServer(action) {
  let json = action.json

  let sour_address = json.PairAddress
  //check message from my friend
  let friend_list = yield select(state => state.avatar.get('Friends'))
  if (!friend_list.includes(sour_address)) {
    // console.log('message is not from my friend...')
    return
  }

  let db = yield select(state => state.avatar.get('Database'))
  let sql = `SELECT * FROM MESSAGES WHERE dest_address = "${sour_address}" AND confirmed = 'FALSE' AND sequence > ${json.CurrentSequence} ORDER BY sequence ASC`
  let items = yield call([db, db.getAll], sql)
  let s = 0
  for (let i = 0; i < items.length; i++) {
    yield call(DelayExec, s * 1000)
    yield put({ type: actionType.avatar.SendMessage, message: items[i].json })
    s = s + 1
  }
}

export function* SendFriendMessage(action) {
  let dest_address = action.address
  let timestamp = action.timestamp
  let db = yield select(state => state.avatar.get('Database'))
  let current_session_aes_key = yield select(state => state.avatar.get('CurrentSessionAesKey'))
  let current_session = yield select(state => state.avatar.get('CurrentSession'))

  //encrypt content
  let content = AesEncrypt(action.message, current_session_aes_key.AesKey)

  let sequence = current_session.Sequence + 1

  let pair_hash = []
  let sql = `SELECT * FROM MESSAGES WHERE sour_address = '${dest_address}' AND confirmed = 'FALSE' ORDER BY sequence ASC LIMIT 8`
  let items = yield call([db, db.getAll], sql)
  if (items.length != 0) {
    items.forEach(item => {
      pair_hash.push(item.hash)
    })
  }

  let MessageGenerator = yield select(state => state.avatar.get('MessageGenerator'))
  let msg = MessageGenerator.genFriendMessage(sequence, current_session.Hash, pair_hash, content, dest_address, timestamp)
  let hash = quarterSHA512(msg)
  let is_file = 'FALSE'
  let file_saved = 'FALSE'
  let fileSHA1 = null

  // Forward Bulletin
  let is_object = 'FALSE'
  let object_type = ''
  let object_json = {}
  try {
    object_json = JSON.parse(action.message)
    if (checkObjectSchema(object_json)) {
      is_object = 'TRUE'
      object_type = object_json.ObjectType
    }
  } catch (e) {
  }

  sql = `INSERT INTO MESSAGES (dest_address, sequence, pre_hash, content, timestamp, json, hash, created_at, readed, is_file, file_saved, file_sha1, is_object, object_type)
VALUES ('${dest_address}', ${sequence}, '${current_session.Hash}', '${action.message}', '${timestamp}', '${msg}', '${hash}', '${timestamp}', 'TRUE', '${is_file}', '${file_saved}', '${fileSHA1}', '${is_object}', '${object_type}')`
  reuslt = yield call([db, db.runSQL], sql)
  if (reuslt.code != 0) {
    yield put({ type: actionType.avatar.SendMessage, message: msg })

    if (dest_address == current_session.Address) {
      //CurrentSession: show message
      let message_list = yield select(state => state.avatar.get('CurrentMessageList'))
      message_list.push({
        "SourAddress": "",
        "Timestamp": timestamp,
        "Sequence": sequence,
        "CreatedAt": timestamp,
        "Content": action.message,
        "Confirmed": false,
        "Hash": hash,
        "IsObject": (is_object == "TRUE"),
        "ObjectJson": object_json
      })
      yield put({ type: actionType.avatar.setCurrentMessageList, message_list: message_list })
    }

    yield put({ type: actionType.avatar.setCurrentSession, address: dest_address, sequence: sequence, hash: hash })

    //update session map
    let session_map = yield select(state => state.avatar.get('SessionMap'))
    session_map[dest_address].Timestamp = timestamp
    session_map[dest_address].Content = action.message
    yield put({ type: actionType.avatar.setSessionMap, session_map: session_map })

    //update db-message(confirmed)
    sql = `UPDATE MESSAGES SET confirmed = 'TRUE' WHERE sour_address = '${dest_address}' AND hash IN (${Array2Str(pair_hash)})`
    reuslt = yield call([db, db.runSQL], sql)
    if (reuslt.code != 0) {
      //update view-message(confirmed)
      if (current_session && dest_address == current_session.Address) {
        let message_list = yield select(state => state.avatar.get('CurrentMessageList'))
        for (let i = message_list.length - 1; i >= 0; i--) {
          if (pair_hash.includes(message_list[i].Hash)) {
            message_list[i].Confirmed = true
          }
        }
        yield put({ type: actionType.avatar.setCurrentMessageList, message_list: message_list })
      }
    }
  }
}