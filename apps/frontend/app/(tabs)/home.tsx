import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth, useIsOfficer } from '../../contexts/AuthContext';
import { statsAPI, loansAPI } from '../../utils/api';

const { width } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  total_beneficiaries?: number;
  total_loans?: number;
  active_loans?: number;
  total_uploads?: number;
  pending_review?: number;
  my_loans?: number;
  my_uploads?: number;
}

interface Loan {
  id: string;
  loan_id: string;
  purpose: string;
  amount: number;
  tenure_months: number;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAT_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  total_beneficiaries: {
    icon: 'people',
    color: '#6366F1',
    label: 'Beneficiaries',
  },
  total_loans: {
    icon: 'document-text',
    color: '#0052A5',
    label: 'Total Loans',
  },
  active_loans: { icon: 'pulse', color: '#10B981', label: 'Active Loans' },
  total_uploads: {
    icon: 'cloud-upload',
    color: '#8B5CF6',
    label: 'Total Uploads',
  },
  pending_review: { icon: 'time', color: '#F59E0B', label: 'Pending Review' },
  my_loans: { icon: 'wallet', color: '#0052A5', label: 'My Loans' },
  my_uploads: { icon: 'images', color: '#EC4899', label: 'My Uploads' },
};

const STATUS_STYLES: Record<
  string,
  { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  pending: { bg: '#FEF3C7', text: '#92400E', icon: 'time' },
  approved: { bg: '#D1FAE5', text: '#065F46', icon: 'checkmark-circle' },
  active: { bg: '#DBEAFE', text: '#1E40AF', icon: 'pulse' },
  completed: { bg: '#F3F4F6', text: '#374151', icon: 'checkmark-done-circle' },
  rejected: { bg: '#FEE2E2', text: '#991B1B', icon: 'close-circle' },
};

function getRoleColor(role: string) {
  return role === 'admin'
    ? '#7C3AED'
    : role === 'officer'
      ? '#0052A5'
      : '#059669';
}
function getRoleIcon(role: string): keyof typeof Ionicons.glyphMap {
  return role === 'admin'
    ? 'shield-checkmark'
    : role === 'officer'
      ? 'briefcase'
      : 'person';
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning 🌅';
  if (hour < 17) return 'Good afternoon ☀️';
  return 'Good evening 🌙';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const isOfficer = useIsOfficer();
  const isAdmin = user?.role === 'admin';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, loansRes] = await Promise.all([
        statsAPI.getDashboard(),
        loansAPI.list(),
      ]);
      setStats(statsRes.data);
      setLoans(loansRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0052A5" />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline" size={64} color="#CBD5E1" />
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorMsg}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Ionicons
            name="refresh"
            size={18}
            color="#FFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Main ────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#0052A5"
        />
      }
    >
      {/* ── Hero Header ─────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <View style={styles.heroCircle} />
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.heroName} numberOfLines={1}>
              {user?.name || user?.phone_number}
            </Text>
          </View>
          <View
            style={[
              styles.rolePill,
              { backgroundColor: getRoleColor(user?.role || '') },
            ]}
          >
            <Ionicons
              name={getRoleIcon(user?.role || '')}
              size={13}
              color="#FFF"
            />
            <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.heroWave} />
      </View>

      {/* ── Stats Grid ──────────────────────────────────────────────────── */}
      <View style={[styles.section, { marginTop: -20 }]}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsGrid}>
          {stats &&
            Object.entries(stats).map(([key, value]) => {
              const meta = STAT_META[key];
              if (!meta) return null;
              return (
                <View key={key} style={styles.statCard}>
                  <View
                    style={[
                      styles.statIconBg,
                      { backgroundColor: meta.color + '18' },
                    ]}
                  >
                    <Ionicons name={meta.icon} size={26} color={meta.color} />
                  </View>
                  <Text style={[styles.statValue, { color: meta.color }]}>
                    {value as number}
                  </Text>
                  <Text style={styles.statLabel}>{meta.label}</Text>
                </View>
              );
            })}
        </View>
      </View>

      {/* ── Quick Actions (Officers) ────────────────────────────────────── */}
      {isOfficer && !isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/review')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#EEF2FF' }]}
              >
                <Ionicons name="checkmark-done" size={28} color="#6366F1" />
              </View>
              <Text style={styles.actionLabel}>Review Media</Text>
              {(stats?.pending_review ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats!.pending_review}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/manage')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#ECFDF5' }]}
              >
                <Ionicons name="person-add" size={28} color="#10B981" />
              </View>
              <Text style={styles.actionLabel}>Add Beneficiary</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/manage')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#FFF7ED' }]}
              >
                <Ionicons name="add-circle" size={28} color="#F59E0B" />
              </View>
              <Text style={styles.actionLabel}>Create Loan</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Quick Actions (Admin) ─────────────────────────────────────────── */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/manage')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#F3E8FF' }]}
              >
                <Ionicons name="people" size={28} color="#7C3AED" />
              </View>
              <Text style={styles.actionLabel}>Manage Users</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/review')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#EEF2FF' }]}
              >
                <Ionicons name="checkmark-done" size={28} color="#6366F1" />
              </View>
              <Text style={styles.actionLabel}>Review Media</Text>
              {(stats?.pending_review ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats!.pending_review}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/manage')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#FEF3C7' }]}
              >
                <Ionicons name="stats-chart" size={28} color="#D97706" />
              </View>
              <Text style={styles.actionLabel}>View Reports</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Quick Actions (Beneficiary) ──────────────────────────────────── */}
      {!isOfficer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/upload')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#EFF6FF' }]}
              >
                <Ionicons name="cloud-upload" size={28} color="#0052A5" />
              </View>
              <Text style={styles.actionLabel}>Upload Docs</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/my-uploads')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#FDF4FF' }]}
              >
                <Ionicons name="images" size={28} color="#9333EA" />
              </View>
              <Text style={styles.actionLabel}>My Uploads</Text>
              {(stats?.my_uploads ?? 0) > 0 && (
                <View style={[styles.badge, { backgroundColor: '#9333EA' }]}>
                  <Text style={styles.badgeText}>{stats!.my_uploads}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.8}
            >
              <View
                style={[styles.actionIconBg, { backgroundColor: '#ECFDF5' }]}
              >
                <Ionicons name="person-circle" size={28} color="#059669" />
              </View>
              <Text style={styles.actionLabel}>My Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Recent Loans ─────────────────────────────────────────────────── */}
      <View style={[styles.section, { paddingBottom: 32 }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Loans</Text>
          {loans.length > 5 && (
            <TouchableOpacity>
              <Text style={styles.viewAll}>View All →</Text>
            </TouchableOpacity>
          )}
        </View>

        {loans.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={56} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No Loans Yet</Text>
            <Text style={styles.emptySubtitle}>
              {isOfficer
                ? 'Create the first loan from the Manage tab.'
                : 'Your loans will appear here.'}
            </Text>
            {isOfficer && (
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/(tabs)/manage')}
              >
                <Text style={styles.emptyBtnText}>Create First Loan</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          loans.slice(0, 5).map((loan) => {
            const s = STATUS_STYLES[loan.status] || STATUS_STYLES.pending;
            return (
              <View key={loan.id} style={styles.loanCard}>
                <View style={styles.loanTop}>
                  <View style={styles.loanTitleRow}>
                    <Ionicons name="wallet" size={18} color="#0052A5" />
                    <Text style={styles.loanId}>#{loan.loan_id}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                    <Ionicons name={s.icon} size={12} color={s.text} />
                    <Text style={[styles.statusText, { color: s.text }]}>
                      {loan.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.loanPurpose} numberOfLines={1}>
                  {loan.purpose}
                </Text>
                <View style={styles.loanBottom}>
                  <View>
                    <Text style={styles.metaLabel}>AMOUNT</Text>
                    <Text style={styles.loanAmount}>
                      ₹{loan.amount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.metaLabel}>TENURE</Text>
                    <Text style={styles.loanTenure}>
                      {loan.tenure_months} months
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F0F4F8' },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F0F4F8',
  },
  loadingText: { marginTop: 14, fontSize: 15, color: '#6B7280' },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0052A5',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  retryText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Hero
  hero: {
    backgroundColor: '#0052A5',
    paddingTop: 20,
    paddingBottom: 48,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  heroCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60,
    right: -40,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { fontSize: 15, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  heroName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    maxWidth: width * 0.65,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroWave: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: '#F0F4F8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  // Section
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0D1B2A',
    marginBottom: 14,
  },
  viewAll: { fontSize: 13, color: '#0052A5', fontWeight: '600' },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  statIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 32, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    position: 'relative',
  },
  actionIconBg: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Loan cards
  loanCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#475569',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  loanTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  loanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loanId: { fontSize: 15, fontWeight: '700', color: '#0D1B2A' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  loanPurpose: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
    lineHeight: 18,
  },
  loanBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  metaLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  loanAmount: { fontSize: 18, fontWeight: '800', color: '#0052A5' },
  loanTenure: { fontSize: 15, fontWeight: '600', color: '#374151' },

  // Empty state
  empty: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: '#0052A5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
