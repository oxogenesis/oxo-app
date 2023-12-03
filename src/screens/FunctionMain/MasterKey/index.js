import React, { useContext, useEffect, useState } from 'react'
import { View, Text, TextInput } from 'react-native'
import { actionType } from '../../../redux/actions/actionType'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MasterKeySet } from '../../../lib/OXO'
import { connect } from 'react-redux'
import { Button } from '@ant-design/react-native'
import { DefaultHost, DefaultTheme, DefaultBulletinCacheSize } from '../../../lib/Const'
import { ThemeContext } from '../../../theme/theme-context'
import ErrorMsg from '../../../component/ErrorMsg'
import tw from 'twrnc'

//口令设置界面
const MasterKeyScreen = props => {
  const { theme } = useContext(ThemeContext)
  const [masterKey, setMasterKey] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error_msg, setMsg] = useState('')

  useEffect(() => {
    return props.navigation.addListener('focus', () => {
      let timestamp = Date.now()
      try {
        // 所有账号使用全局设置：主题、服务器地址
        // 设置服务器地址
        AsyncStorage.getItem('HostList').then(json => {
          let host_list = []
          if (json != null) {
            let HostList = JSON.parse(json)
            HostList.forEach(item => {
              host_list.push({ Address: item.Address, UpdatedAt: item.UpdatedAt })
            })
          }
          if (host_list.length == 0) {
            host_list.push({ Address: DefaultHost, UpdatedAt: timestamp })
          }
          props.dispatch({
            type: actionType.avatar.changeHostList,
            host_list: host_list
          })
          let current_host = host_list[0].Address
          props.dispatch({
            type: actionType.avatar.setCurrentHost,
            current_host: current_host,
            current_host_timestamp: timestamp
          })
        })

        // 设置主题
        AsyncStorage.getItem('Theme').then(json => {
          let theme = DefaultTheme
          if (json != null) {
            json = JSON.parse(json)
            if (json.Theme != null && json.Theme == 'dark') {
              theme = 'dark'
            }
          }
          props.dispatch({
            type: actionType.avatar.changeTheme,
            theme: theme
          })
        })

        // 设置公告缓存大小
        AsyncStorage.getItem('BulletinCacheSize').then(bulletin_cache_size => {
          if (bulletin_cache_size == null || isNaN(bulletin_cache_size) || bulletin_cache_size < 0) {
            bulletin_cache_size = DefaultBulletinCacheSize
          }
          props.dispatch({
            type: actionType.avatar.changeBulletinCacheSize,
            bulletin_cache_size: bulletin_cache_size
          })
        })

        AsyncStorage.getItem('<#MasterKey#>').then(result => {
          if (result != null) {
            props.navigation.replace('Unlock')
          }
        })
      } catch (e) {
        console.log(e)
      }
    })
  })

  const saveMasterKey = () => {
    if (masterKey != confirm) {
      setMsg('口令确认不符...')
      return
    } else if (masterKey.trim() == '') {
      setMsg('口令不能为空...')
      return
    }

    MasterKeySet(masterKey).then(result => {
      if (result) {
        setMasterKey('')
        setConfirm('')
        props.navigation.replace('Unlock')
      }
    })
  }

  return (
    <View style={tw`h-full bg-stone-200`}>
      <View style={tw.style(`my-auto`)}>
        <TextInput
          style={tw.style(`rounded-full border-solid border-2 border-gray-300 text-base text-center`)}
          secureTextEntry={true}
          placeholder="口令"
          value={masterKey}
          onChangeText={text => setMasterKey(text)}
        />
        <TextInput
          style={tw.style(`rounded-full border-solid border-2 border-gray-300 text-base text-center`)}
          secureTextEntry={true}
          placeholder="口令确认"
          value={confirm}
          onChangeText={text => setConfirm(text)}
        />
        {
          error_msg.length > 0 &&
          <ErrorMsg error_msg={error_msg} />
        }
        <Button style={tw.style(`rounded-full bg-green-500`)} onPress={() => saveMasterKey()}>
          <Text style={tw.style(`text-xl text-slate-100`)}>设置</Text>
        </Button>
        <Text style={tw.style('text-base', 'text-red-500')}>
          {`说明：
1、口令用于在本设备上加密/解密账户的种子。
2、账户的种子是账户的唯一凭证，不可泄漏、灭失，应做好备份。
3、本地存储的聊天和公告，未进行加密，如需销毁，请删除应用或相关数据。`}
        </Text>
      </View>
    </View>
  )
}

const ReduxMasterKeyScreen = connect((state) => {
  return {
    avatar: state.avatar,
    master: state.master
  }
})(MasterKeyScreen)

export default ReduxMasterKeyScreen