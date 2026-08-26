import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { getSyncStatus, processSyncQueue } from '../../utils/offlineSync';

type IoniconName = keyof typeof Ionicons.glyphMap;

function getRoleColor(role: string)  { return role === 'admin' ? '#7C3AED' : role === 'officer' ? '#0052A5' : '#059669'; }
function getRoleIcon(role: string): IoniconName {
  return role === 'admin' ? 'shield-checkmark' : role === 'officer' ? 'briefcase' : 'person';
}
function getRoleLabel(role: string) {
  return role === 'admin' ? 'Administrator' : role === 'officer' ? 'Loan Officer' : 'Beneficiary';
}

interface InfoRowProps { label: string; value: string; icon: IoniconName; }
function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={16} color="#6B7280" style={{ marginRight: 8 }} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncPending, setSyncPending] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getSyncStatus().then(s => setSyncPending(s.pending));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await processSyncQueue();
      setSyncPending(0);
      Alert.alert('Sync Complete', `✅ ${result.success} synced   ❌ ${result.failed} failed`);
    } catch {
      Alert.alert('Sync Error', 'Could not sync offline data. Try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRefreshProfile = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
    Alert.alert('Updated', 'Profile refreshed from server.');
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        logout();
      }
      return;
    }

    Alert.alert(
      'Log Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            // Navigation is handled automatically by the <Redirect href="/login" />
            // guard in (tabs)/_layout.tsx once isAuthenticated becomes false.
          },
        },
      ]
    );
  };

  const roleColor = getRoleColor(user?.role || '');

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <View style={styles.heroCircle} />
        <View style={[styles.avatarRing, { borderColor: roleColor + '40' }]}>
          <View style={[styles.avatarBg, { backgroundColor: roleColor + '22' }]}>
            <Ionicons name={getRoleIcon(user?.role || '')} size={44} color={roleColor} />
          </View>
        </View>
        <Text style={styles.nameText}>{user?.name || 'User'}</Text>
        <Text style={styles.phoneText}>{user?.phone_number}</Text>
        <View style={[styles.rolePill, { backgroundColor: roleColor }]}>
          <Ionicons name={getRoleIcon(user?.role || '')} size={13} color="#FFF" />
          <Text style={styles.roleText}>{getRoleLabel(user?.role || '')}</Text>
        </View>
        <View style={styles.heroWave} />
      </View>

      <View style={styles.body}>

        {/* ── Account Info ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={22} color="#0052A5" />
            <Text style={styles.cardTitle}>Account Details</Text>
          </View>
          <InfoRow label="User ID"      value={user?.id?.slice(0, 12) + '…' || '—'} icon="key-outline"      />
          <InfoRow label="Role"         value={getRoleLabel(user?.role || '')}        icon="ribbon-outline"  />
          <InfoRow label="Joined"       value={user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} icon="calendar-outline" />

          {/* Refresh profile */}
          <TouchableOpacity style={styles.refreshBtn} onPress={handleRefreshProfile} disabled={refreshing}>
            {refreshing
              ? <ActivityIndicator size="small" color="#0052A5" />
              : <><Ionicons name="refresh-outline" size={16} color="#0052A5" style={{ marginRight: 6 }} />
                  <Text style={styles.refreshBtnText}>Refresh Profile</Text></>
            }
          </TouchableOpacity>
        </View>

        {/* ── Offline Sync ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-outline" size={22} color="#0052A5" />
            <Text style={styles.cardTitle}>Offline Sync</Text>
            {syncPending > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{syncPending}</Text>
              </View>
            )}
          </View>
          <Text style={styles.syncDesc}>
            {syncPending === 0
              ? 'All data is up to date. ✅'
              : `${syncPending} action(s) are queued and waiting to be synced when online.`}
          </Text>
          {syncPending > 0 && (
            <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
              {syncing
                ? <ActivityIndicator color="#FFF" />
                : <><Ionicons name="cloud-upload" size={18} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={styles.syncBtnText}>Sync Now</Text></>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* ── App Info ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={22} color="#0052A5" />
            <Text style={styles.cardTitle}>App Information</Text>
          </View>
          <InfoRow label="App Name"    value="LoanTrack"    icon="phone-portrait-outline" />
          <InfoRow label="Version"     value="1.0.0"        icon="code-slash-outline"     />
          <InfoRow label="Environment" value="Development"  icon="construct-outline"      />
        </View>

        {/* ── Logout ────────────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.copyright}>© 2025 LoanTrack · All rights reserved</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4F8' },

  // Hero
  hero: {
    backgroundColor: '#0052A5', alignItems: 'center',
    paddingTop: 36, paddingBottom: 60, overflow: 'hidden', position: 'relative',
  },
  heroCircle: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.06)', top: -80, right: -60 },
  heroWave: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, backgroundColor: '#F0F4F8', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  avatarRing: { width: 104, height: 104, borderRadius: 52, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  avatarBg: { width: 92, height: 92, borderRadius: 46, justifyContent: 'center', alignItems: 'center' },
  nameText: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  phoneText: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 14 },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  roleText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  body: { paddingHorizontal: 16, marginTop: -20 },

  // Cards
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0D1B2A', flex: 1 },
  countBadge: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  countBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Info rows
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoLeft: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  infoValue: { fontSize: 13, color: '#0D1B2A', fontWeight: '600', maxWidth: '55%', textAlign: 'right' },

  refreshBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#0052A5' },
  refreshBtnText: { color: '#0052A5', fontSize: 14, fontWeight: '600' },

  // Sync
  syncDesc: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 12 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0052A5', borderRadius: 12, paddingVertical: 13, shadowColor: '#0052A5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  syncBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Logout
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 16, borderWidth: 1.5, borderColor: '#FEE2E2', marginBottom: 16 },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '700' },

  copyright: { textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginBottom: 32 },
});
