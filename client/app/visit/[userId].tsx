import { useHeaderHeight } from '@react-navigation/elements';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AgentChat } from '@/components/agent-chat';
import { DirectChat } from '@/components/direct-chat';
import { ScreenBackground } from '@/components/screen-background';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HeaderIdentity } from '@/components/ui/header-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Pill } from '@/components/ui/pill';
import { SegmentedControl } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useT } from '@/lib/i18n';
import type { JudgeStatus, UserProfile } from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';

type Mode = 'avatar' | 'real';

/** 访客看到的「TA 想让你知道的」:对外形象全文,可收起。 */
function IntroCard({
  profile,
  expanded,
  onToggle,
}: {
  profile: UserProfile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const hasPersona = !!profile.persona;
  return (
    <Card padded={false} style={styles.intro}>
      <Pressable onPress={onToggle} style={styles.introHeader} accessibilityRole="button">
        <IconSymbol name="person.text.rectangle.fill" size={16} color={colors.tint} />
        <Text style={[Type.footnote, styles.introTitle, { color: colors.textSecondary }]}>
          {hasPersona ? t.visit.intro(profile.username) : t.visit.noIntro(profile.username)}
        </Text>
        {hasPersona && (
          <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={13} color={colors.textTertiary} />
        )}
      </Pressable>
      {hasPersona && expanded && (
        <Text style={[Type.callout, styles.introBody, { color: colors.text }]} selectable>
          {profile.persona}
        </Text>
      )}
      {expanded && profile.tags.length > 0 && (
        <View style={styles.introTags}>
          {profile.tags.map((t) => (
            <Pill key={t} label={t} tone="tint" />
          ))}
        </View>
      )}
      {!hasPersona && (
        <Text style={[Type.footnote, styles.introBody, { color: colors.textTertiary }]}>
          {t.visit.noIntroHint}
        </Text>
      )}
    </Card>
  );
}

export default function VisitAgentScreen() {
  const { userId, username, builtin, avatarTs, mode: initialMode } = useLocalSearchParams<{
    userId: string;
    username?: string;
    builtin?: string;
    avatarTs?: string;
    // 'real' = 从真人聊天列表进来,直接打开真人对话
    mode?: string;
  }>();
  const { colors } = useTheme();
  const t = useT();
  const chatBg = useSettingsStore((s) => s.chatBg);
  const myId = useAuthStore((s) => s.userId);
  // 此页有导航头:键盘规避需要补上 header 高度(含状态栏)
  const headerHeight = useHeaderHeight();

  const isSelf = userId === myId;
  const isBuiltin = builtin === '1';
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // 名人化身、种子账号背后没有真人,不显示裁判入口;资料拉到之前不请求裁判接口(避免对种子用户打出 400)
  const judgeable = !isSelf && !isBuiltin && profile?.accepts_real_chat === true;
  const [introExpanded, setIntroExpanded] = useState(true);
  const [judge, setJudge] = useState<JudgeStatus | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode === 'real' ? 'real' : 'avatar');

  useEffect(() => {
    if (!userId) return;
    api
      .getProfile(userId)
      .then(setProfile)
      .catch(() => {});
  }, [userId]);

  const refreshJudge = useCallback(() => {
    if (!judgeable || !userId) return;
    api
      .getJudgeStatus(userId)
      .then(setJudge)
      .catch(() => {});
  }, [judgeable, userId]);

  useEffect(() => {
    refreshJudge();
  }, [refreshJudge]);

  const evaluate = async () => {
    if (evaluating || !userId) return;
    setEvaluating(true);
    setJudgeError(null);
    try {
      const status = await api.evaluateMatch(userId);
      setJudge(status);
      setShowReport(true);
      haptic.success();
    } catch (e) {
      setJudgeError(e instanceof Error ? e.message : String(e));
      haptic.error();
    } finally {
      setEvaluating(false);
    }
  };

  const report = judge?.report ?? null;
  const unlocked = judge?.unlocked ?? false;
  const turnsLeft = judge ? Math.max(0, judge.min_turns - judge.visitor_turns) : null;
  const displayName = profile?.username ?? username ?? '';

  const subtitle = isSelf
    ? t.visit.selfSubtitle
    : isBuiltin
      ? t.chats.celebrity
      : profile?.status
        ? t.common.today(profile.status)
        : profile
          ? t.common.cards(profile.card_count)
          : null;

  const emptyTitle = isSelf ? t.visit.emptyTitleSelf : t.visit.emptyTitle(displayName);
  const emptyHint = isSelf
    ? t.visit.emptyHintSelf
    : isBuiltin
      ? t.visit.emptyHintCelebrity
      : profile && !profile.accepts_real_chat
        ? t.visit.emptyHintSeed(displayName)
        : t.visit.emptyHint(displayName);

  return (
    <ScreenBackground setting={chatBg}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderIdentity
              username={displayName}
              userId={userId}
              avatarTs={avatarTs || profile?.avatar_updated_at}
              subtitle={subtitle}
            />
          ),
        }}
      />

      {judgeable && (
        <View style={styles.toolbar}>
          {unlocked ? (
            <SegmentedControl<Mode>
              options={[
                { key: 'avatar', label: t.visit.avatar },
                { key: 'real', label: t.visit.person(displayName) },
              ]}
              value={mode}
              onChange={setMode}
              style={styles.flex}
              size="sm"
            />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon="scalemass.fill"
              loading={evaluating}
              title={turnsLeft !== null && turnsLeft > 0 ? t.visit.judgeMore(turnsLeft) : t.visit.judge}
              onPress={evaluate}
              style={styles.flex}
            />
          )}
          {report && (
            <Pressable onPress={() => setShowReport(true)}>
              <Pill label={t.visit.score(report.score)} tone={report.passed ? 'success' : 'neutral'} />
            </Pressable>
          )}
        </View>
      )}
      {evaluating && (
        <Text style={[Type.caption1, styles.evaluating, { color: colors.textTertiary }]}>
          {t.visit.judging}
        </Text>
      )}
      {judgeError && <Banner tone="danger" message={judgeError} style={styles.banner} />}

      {judgeable && unlocked && mode === 'real' ? (
        <DirectChat userId={userId} username={displayName} keyboardOffset={headerHeight} />
      ) : judgeable && mode === 'real' && judge === null ? (
        // 从真人聊天列表直接进来:解锁状态还没拉到,先转圈,避免闪一下化身对话
        <View style={styles.loadingBody}>
          <ActivityIndicator />
        </View>
      ) : (
        <AgentChat
          targetUserId={userId}
          avatar={{ username: displayName, userId, avatarTs: avatarTs || profile?.avatar_updated_at }}
          keyboardOffset={headerHeight}
          emptyTitle={emptyTitle}
          emptyHint={emptyHint}
          starters={isSelf ? t.visit.starters : undefined}
          startersTitle={isSelf ? t.visit.startersTitle : undefined}
          onMessageSent={judgeable ? refreshJudge : undefined}
          onHistoryLoaded={(count) => setIntroExpanded(count === 0)}
          intro={
            !isSelf && !isBuiltin && profile ? (
              <IntroCard profile={profile} expanded={introExpanded} onToggle={() => setIntroExpanded((v) => !v)} />
            ) : isSelf && profile && !profile.persona ? (
              <Card tone="tint" style={styles.intro}>
                <Text style={[Type.footnote, { color: colors.text }]}>{t.visit.personaNudge}</Text>
                <Button title={t.visit.goWrite} variant="ghost" size="sm" onPress={() => router.push('/persona-editor')} style={styles.introAction} />
              </Card>
            ) : null
          }
        />
      )}

      {/* 契合度报告 */}
      <Sheet visible={showReport} onClose={() => setShowReport(false)} title={t.visit.reportTitle}>
        {report && (
          <View style={styles.report}>
            <Text style={[styles.reportScore, { color: report.passed ? colors.success : colors.text }]}>
              {report.score}
              <Text style={[Type.headline, { color: colors.textTertiary }]}> / 100</Text>
            </Text>
            <Text style={[Type.callout, styles.reportSummary, { color: colors.text }]}>{report.summary}</Text>
            <View style={styles.reasons}>
              {report.reasons.map((r, i) => (
                <View key={i} style={styles.reason}>
                  <View style={[styles.reasonDot, { backgroundColor: colors.tint }]} />
                  <Text style={[Type.subhead, styles.reasonText, { color: colors.textSecondary }]}>{r}</Text>
                </View>
              ))}
            </View>
            <Text style={[Type.footnote, styles.verdict, { color: colors.textSecondary }]}>
              {report.passed ? t.visit.passed(displayName) : t.visit.notPassed}
            </Text>
            <Button
              title={report.passed ? t.visit.talkToPerson : t.common.ok}
              fullWidth
              onPress={() => {
                setShowReport(false);
                if (report.passed) setMode('real');
              }}
            />
          </View>
        )}
      </Sheet>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  evaluating: { paddingHorizontal: 20, paddingBottom: 4 },
  banner: { marginHorizontal: 16, marginTop: 6 },
  loadingBody: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { marginHorizontal: 2, marginTop: 6, marginBottom: 10 },
  introHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  introTitle: { flex: 1, fontWeight: '600' },
  introBody: { paddingHorizontal: 14, paddingBottom: 12, lineHeight: 22 },
  introTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 14 },
  introAction: { alignSelf: 'flex-end', marginTop: 4 },
  report: { gap: 14, paddingTop: 4 },
  reportScore: { textAlign: 'center', fontSize: 52, lineHeight: 60, fontWeight: '800', letterSpacing: -1 },
  reportSummary: { textAlign: 'center', lineHeight: 23 },
  reasons: { gap: 8 },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reasonDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  reasonText: { flex: 1 },
  verdict: { textAlign: 'center' },
});
