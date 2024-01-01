import React, { useContext } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { connect } from 'react-redux'
import { List, WhiteSpace } from '@ant-design/react-native'
import EmptyView from '../../FunctionBase/EmptyView'
import { ThemeContext } from '../../../theme/theme-context'
import BaseImageList from '../../FunctionBase/BaseImageList'
import BaseAvatarList from '../../FunctionBase/BaseAvatarList'
const Item = List.Item

//联系人Tab
const TabAddressBookScreen = props => {
  const { theme } = useContext(ThemeContext)

  const lists = props.avatar.get('AddressArray').map(item => ({
    title: item.Name,
    address: item.Address,
    onpress: () => props.navigation.push('AddressMark', { address: item.Address })
  }))


  return (
    <ScrollView
      style={{ flex: 1, height: '100%', backgroundColor: theme.base_view }}
      automaticallyAdjustContentInsets={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}>
      {/* <WhiteSpace />
      <View>
        <Text style={{
          paddingLeft: 12,
          color: theme.text2,
          borderBottomWidth: 1,
          borderColor: theme.line,
          paddingBottom: 12,
        }}>添加好友</Text>
        <BaseImageList data={[{
          title: '扫一扫',
          img: 'sys',
          backgroundColor: '#1296db',
          onpress: () => props.navigation.navigate('AddressScan')
        }, {
          title: '新朋友',
          img: 'add',
          backgroundColor: '#0e932e',
          onpress: () => props.navigation.navigate('AddressAdd')
        }]} />
      </View>
      <WhiteSpace /> */}


      {
        props.avatar.get('AddressArray').length > 0 ?
          <View>
            <BaseAvatarList data={lists} />
          </View>
          :
          <EmptyView />
      }
    </ScrollView>
  )
}


const ReduxTabAddressBookScreen = connect((state) => {
  return {
    avatar: state.avatar
  }
})(TabAddressBookScreen)

export default ReduxTabAddressBookScreen