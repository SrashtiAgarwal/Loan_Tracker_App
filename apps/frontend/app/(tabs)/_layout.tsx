import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface TabConfig {
  name: string;
  title: string;
  icon: IoniconName; // filled (focused)
  outlineIcon: IoniconName; // outlined (unfocused)
  roles: string[];
}

const ALL_TABS: TabConfig[] = [
  {
    name: 'home',
    title: 'Home',
    icon: 'home',
    outlineIcon: 'home-outline',
    roles: ['beneficiary', 'officer', 'admin'],
  },
  {
    name: 'upload',
    title: 'Upload',
    icon: 'camera',
    outlineIcon: 'camera-outline',
    roles: ['beneficiary'],
  },
  {
    name: 'my-uploads',
    title: 'My Uploads',
    icon: 'images',
    outlineIcon: 'images-outline',
    roles: ['beneficiary'],
  },
  {
    name: 'review',
    title: 'Review',
    icon: 'checkmark-circle',
    outlineIcon: 'checkmark-circle-outline',
    roles: ['officer', 'admin'],
  },
  {
    name: 'manage',
    title: 'Manage',
    icon: 'people',
    outlineIcon: 'people-outline',
    roles: ['officer', 'admin'],
  },
  {
    name: 'profile',
    title: 'Profile',
    icon: 'person-circle',
    outlineIcon: 'person-circle-outline',
    roles: ['beneficiary', 'officer', 'admin'],
  },
];

export default function TabsLayout() {
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const role = user?.role || 'beneficiary';

  // Dynamic tab bar height: content area + bottom safe area inset
  const TAB_CONTENT_HEIGHT = 52;
  const tabBarHeight = TAB_CONTENT_HEIGHT + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0052A5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerStyle: styles.header,
        headerStatusBarHeight: insets.top,
        headerTintColor: '#FFF',
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
      }}
    >
      {ALL_TABS.map((tab) => {
        const isVisible = tab.roles.includes(role);
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              href: isVisible ? undefined : null,
              tabBarIcon: ({ color, focused }) => {
                if (focused) {
                  return (
                    <View style={styles.activeIconWrap}>
                      <Ionicons name={tab.icon} size={20} color={color} />
                    </View>
                  );
                }
                return (
                  <Ionicons name={tab.outlineIcon} size={20} color={color} />
                );
              },
            }}
          />
        );
      })}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    paddingTop: 6,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
  activeIconWrap: {
    backgroundColor: '#EEF2FF',
    borderRadius: 16,
    width: 56,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    backgroundColor: '#0052A5',
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 0.2,
  },
});
