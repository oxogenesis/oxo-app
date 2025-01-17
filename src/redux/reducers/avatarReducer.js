import { actionType } from '../actions/actionType'
import { fromJS, set } from 'immutable'
import { DefaultBulletinCacheSize } from '../../lib/Const'
import { ConsoleWarn } from '../../lib/Util'
import { SlideFromRightIOS } from '@react-navigation/stack/lib/typescript/src/TransitionConfigs/TransitionPresets'

function initialState() {
  return fromJS(
    {
      Ready: false,
      Seed: null,
      Address: null,
      PublicKey: null,
      PrivateKey: null,

      AvatarDB: null,

      // Network
      HostList: [],
      CurrentHost: null,
      WebSocket: null,
      WebSocketChannel: null,
      ConnStatus: false,

      MessageGenerator: null,

      // Contact
      AddressMap: {},
      AddressArray: [],
      CurrentAddressMark: null,

      Friends: [],
      FriendRequests: [],
      Follows: [],

      // Bulletin
      TabBulletinList: [],
      BulletinList: [],
      CurrentBBSession: null,
      CurrentBulletin: null,
      setNextBulletinSequence: null,
      CurrentBulletinFile: null,
      RandomBulletin: null,
      RandomBulletinFlag: false,
      QuoteList: [],
      QuoteWhiteList: [],
      FileList: [],
      ReplyList: [],
      BulletinCacheSize: DefaultBulletinCacheSize,
      BulletinAddressList: [],
      BulletinReplyList: [],

      // Chat
      SessionMap: {},
      SessionList: [],
      UnreadMessage: 0,
      UnreadSessionMap: {},
      CurrentSession: {},
      CurrentSessionAesKey: {},
      CurrentMessageList: [],
      MsgInfo: null,
      // bulletin from message
      MessageWhiteList: [],
      CountUnreadMessage: 0
    }
  )
}

export default function reducer(state = initialState(), action) {
  if (typeof reducer.prototype[action.type] === "function") {
    return reducer.prototype[action.type](state, action)
  } else {
    return state
  }
}

reducer.prototype[actionType.avatar.setAvatar] = (state, action) => {
  return state.set('Seed', action.seed)
    .set('Name', action.name)
    .set('Address', action.address)
    .set('PublicKey', action.public_key)
    .set('PrivateKey', action.private_key)
    // DB
    .set('AvatarDB', null)
    // Network
    .set('CurrentHost', null)
    // Contact
    .set('CurrentAddressMark', null)
    .set('Follows', [])
    .set('Friends', [])
    .set('FriendRequests', [])
    // Bulletin
    .set('CurrentBBSession', null)
    .set('CurrentBulletin', null)
    .set('NextBulletinSequence', null)
    .set('CurrentBulletinFile', null)
    .set('RandomBulletin', null)
    .set('RandomBulletinFlag', false)
    .set('AddressMap', {})
    .set('AddressArray', [])
    .set('TabBulletinList', [])
    .set('BulletinList', [])
    .set('QuoteList', [])
    .set('QuoteWhiteList', [])
    .set('FileList', [])
    .set('ReplyList', [])
    .set('BulletinAddressList', [])
    .set('BulletinReplyList', [])
    // // Chat
    .set('SessionMap', {})
    .set('SessionList', [])
    .set('UnreadMessage', 0,)
    .set('UnreadSessionMap', {})
    .set('CurrentSession', {})
    .set('CurrentSessionAesKey', {})
    .set('CurrentMessageList', [])
    .set('MsgInfo', null)
    .set('CountUnreadMessage', null)
    .set('MessageWhiteList', [])
}

reducer.prototype[actionType.avatar.resetAvatar] = (state) => {
  return state.set('Ready', false)
    .set('Seed', null)
    .set('Name', null)
    .set('Address', null)
    .set('PublicKey', null)
    .set('PrivateKey', null)
    // DB
    .set('AvatarDB', null)
    // Network
    .set('CurrentHost', null)
    // Contact
    .set('CurrentAddressMark', null)
    .set('Follows', [])
    .set('Friends', [])
    .set('FriendRequests', [])
    // Bulletin
    .set('CurrentBBSession', null)
    .set('CurrentBulletin', null)
    .set('NextBulletinSequence', null)
    .set('CurrentBulletinFile', null)
    .set('RandomBulletin', null)
    .set('RandomBulletinFlag', false)
    .set('AddressMap', {})
    .set('AddressArray', [])
    .set('TabBulletinList', [])
    .set('BulletinList', [])
    .set('QuoteList', [])
    .set('QuoteWhiteList', [])
    .set('FileList', [])
    .set('ReplyList', [])
    .set('BulletinAddressList', [])
    .set('BulletinReplyList', [])
    // Chat
    .set('SessionMap', {})
    .set('SessionList', [])
    .set('UnreadMessage', 0,)
    .set('UnreadSessionMap', {})
    .set('CurrentSession', {})
    .set('CurrentMessageList', [])
    .set('MsgInfo', [])
    .set('CountUnreadMessage', null)
    .set('MessageWhiteList', [])
}

reducer.prototype[actionType.avatar.setAvatarName] = (state, action) => {
  return state.set('Name', action.name)
}

reducer.prototype[actionType.avatar.setAvatarDB] = (state, action) => {
  return state.set('AvatarDB', action.db)
}

reducer.prototype[actionType.avatar.setReady] = (state, action) => {
  return state.set('Ready', true)
}

///////////////////////////////////////////////////////////////////////////////
// Contact
///////////////////////////////////////////////////////////////////////////////
reducer.prototype[actionType.avatar.setAddressBook] = (state, action) => {
  let self_address = state.get('Address')
  let address_list = []
  Object.keys(action.address_map).forEach(address => {
    if (self_address !== address) {
      address_list.push({ "Address": address, "Name": action.address_map[address] })
    }
  })
  address_list.sort(function (m, n) {
    if (m.Name > n.Name) return 1
    else if (m.Name < n.Name) return -1
    else return 0
  })
  return state.set('AddressMap', action.address_map)
    .set('AddressArray', address_list)
}

reducer.prototype[actionType.avatar.setCurrentAddressMark] = (state, action) => {
  let tmp = {}
  tmp.Address = action.address
  tmp.IsFollow = state.get('Follows').includes(tmp.Address)
  tmp.IsFriend = state.get('Friends').includes(tmp.Address)
  return state.set('CurrentAddressMark', tmp)
}

reducer.prototype[actionType.avatar.setFriends] = (state, action) => {
  return state.set('Friends', action.friend_list)
}

reducer.prototype[actionType.avatar.setFriendRequests] = (state, action) => {
  return state.set('FriendRequests', action.friend_request_list)
}

reducer.prototype[actionType.avatar.setFollows] = (state, action) => {
  return state.set('Follows', action.follow_list)
}

///////////////////////////////////////////////////////////////////////////////
// Network
///////////////////////////////////////////////////////////////////////////////
reducer.prototype[actionType.avatar.setHostList] = (state, action) => {
  return state.set('HostList', action.host_list)
}

reducer.prototype[actionType.avatar.setCurrentHost] = (state, action) => {
  return state.set('CurrentHost', action.current_host)
    .set('CurrentHostTimestamp', action.current_host_timestamp)
}

reducer.prototype[actionType.avatar.setWebSocket] = (state, action) => {
  return state.set('WebSocket', action.websocket)
}

reducer.prototype[actionType.avatar.setWebSocketChannel] = (state, action) => {
  return state.set('WebSocketChannel', action.channel)
}

reducer.prototype[actionType.avatar.setConnStatus] = (state, action) => {
  return state.set('ConnStatus', action.status)
}

reducer.prototype[actionType.avatar.setMessageGenerator] = (state, action) => {
  return state.set('MessageGenerator', action.message_generator)
}

///////////////////////////////////////////////////////////////////////////////
// Bulletin
///////////////////////////////////////////////////////////////////////////////
reducer.prototype[actionType.avatar.setBulletinCacheSize] = (state, action) => {
  return state.set('BulletinCacheSize', action.bulletin_cache_size)
}

reducer.prototype[actionType.avatar.setTabBulletinList] = (state, action) => {
  return state.set('TabBulletinList', action.tab_bulletin_list)
}

reducer.prototype[actionType.avatar.setBulletinList] = (state, action) => {
  return state.set('BulletinList', action.bulletin_list)
}

reducer.prototype[actionType.avatar.setCurrentBulletin] = (state, action) => {
  return state.set('CurrentBulletin', action.bulletin)
}

reducer.prototype[actionType.avatar.setNextBulletinSequence] = (state, action) => {
  return state.set('NextBulletinSequence', action.sequence)
}

reducer.prototype[actionType.avatar.setRandomBulletin] = (state, action) => {
  return state.set('RandomBulletin', action.bulletin)
}

reducer.prototype[actionType.avatar.setRandomBulletinFlag] = (state, action) => {
  return state.set('RandomBulletinFlag', action.flag)
}

reducer.prototype[actionType.avatar.setBulletinAddressList] = (state, action) => {
  return state.set('BulletinAddressList', action.bulletin_address_list)
}

reducer.prototype[actionType.avatar.setBulletinReplyList] = (state, action) => {
  return state.set('BulletinReplyList', action.bulletin_reply_list)
}

reducer.prototype[actionType.avatar.setQuoteList] = (state, action) => {
  return state.set('QuoteList', action.quote_list)
}

reducer.prototype[actionType.avatar.setQuoteWhiteList] = (state, action) => {
  return state.set('QuoteWhiteList', action.quote_white_list)
}

reducer.prototype[actionType.avatar.setReplyList] = (state, action) => {
  return state.set('ReplyList', action.reply_list)
}

reducer.prototype[actionType.avatar.addQuoteList] = (state, action) => {
  let quote_list = state.get('QuoteList')

  if (quote_list.length >= 8) {
    return state.set('QuoteList', quote_list)
  }
  for (const quote of quote_list) {
    if (quote.Hash == action.hash) {
      return state.set('QuoteList', quote_list)
    }
  }

  quote_list.push({
    Address: action.address,
    Sequence: action.sequence,
    Hash: action.hash
  })
  return state.set('QuoteList', quote_list)
}

reducer.prototype[actionType.avatar.delQuoteList] = (state, action) => {
  let quote_list = state.get('QuoteList')
  let tmp_quote_list = []
  for (const quote of quote_list) {
    if (quote.Hash != action.hash) {
      tmp_quote_list.push(quote)
    }
  }
  return state.set('QuoteList', tmp_quote_list)
}

reducer.prototype[actionType.avatar.addFileList] = (state, action) => {
  let file_json = action.file_json
  let file_list = state.get('FileList')

  if (file_list.length >= 8) {
    return state.set('FileList', file_list)
  }
  for (const file of file_list) {
    if (file.Hash == file_json.Hash) {
      return state.set('FileList', file_list)
    }
  }

  file_list.push(file_json)
  return state.set('FileList', file_list)
}

reducer.prototype[actionType.avatar.delFileList] = (state, action) => {
  let file_list = state.get('FileList')
  let tmp_file_list = []
  for (const file of file_list) {
    if (file.Hash != action.Hash) {
      tmp_file_list.push(file)
    }
  }
  return state.set('FileList', tmp_file_list)
}


reducer.prototype[actionType.avatar.setCurrentBulletinFile] = (state, action) => {
  return state.set('CurrentBulletinFile', action.file)
}

// Chat
reducer.prototype[actionType.avatar.setCurrentBBSession] = (state, action) => {
  return state.set('CurrentBBSession', action.current_BB_session)
}

///////////////////////////////////////////////////////////////////////////////
// Chat
///////////////////////////////////////////////////////////////////////////////
reducer.prototype[actionType.avatar.setSessionMap] = (state, action) => {
  let session_list = Object.values(action.session_map)
  ConsoleWarn(session_list)
  session_list.sort(function (m, n) {
    if (m.Timestamp < n.Timestamp) return 1
    else if (m.Timestamp > n.Timestamp) return -1
    else return 0
  })

  let count = 0
  session_list.forEach(session => {
    count += session.CountUnread
  })
  if (count == 0) {
    count = null
  }

  return state.set('SessionList', session_list)
    .set('SessionMap', action.session_map)
    .set('CountUnreadMessage', count)
}

reducer.prototype[actionType.avatar.setCurrentSession] = (state, action) => {
  let session = state.get('CurrentSession')
  if (action.address != null) {
    session.Address = action.address
    if (action.sequence != null) {
      session.Sequence = action.sequence
      session.Hash = action.hash
    }
  } else {
    session = {}
  }
  return state.set('CurrentSession', session)
}

reducer.prototype[actionType.avatar.setCurrentSessionAesKey] = (state, action) => {
  let session = state.get('CurrentSessionAesKey')
  if (action.address != null) {
    session.Address = action.address
    if (action.aes_key != null) {
      session.AesKey = action.aes_key
      session.EcdhSequence = action.ecdh_sequence
    }
  } else {
    session = {}
  }
  return state.set('CurrentSessionAesKey', session)
}

reducer.prototype[actionType.avatar.setCurrentMessageList] = (state, action) => {
  return state.set('CurrentMessageList', action.message_list)
}

reducer.prototype[actionType.avatar.setMsgInfo] = (state, action) => {
  return state.set('MsgInfo', action.msg_info)
}

reducer.prototype[actionType.avatar.setMessageWhiteList] = (state, action) => {
  return state.set('MessageWhiteList', action.message_white_list)
}