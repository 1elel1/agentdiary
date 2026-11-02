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
  const hasPersona = !!profile.persona;
  return (
    <Card padded={false} style={styles.intro}>
      <Pressable onPress={onToggle} style={styles.introHeader} accessibilityRole="button">
        <IconSymbol name="person.text.rectangle.fill" size={16} color={colors.tint} />
        <Text style={[Type.footnote, styles.introTitle, { color: colors.textSecondary }]}>
          {hasPersona ? `${profile.username} 的自我介绍` : `${profile.username} 还没写自我介绍`}
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
      {!hasPersona && (
        <Text style={[Type.footnote, styles.introBody, { color: colors.textTertiary }]}>
          化身会依据 TA 的日记学到的东西来聊;问到它不知道的,它会说得由本人来答。
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
  const chatBg = useSettingsStore((s) => s.chatBg);
  const myId = useAuthStore((s) => s.userId);
  // 此页有导航头:键盘规避需要补上 header 高度(含状态栏)
  const headerHeight = useHeaderHeight();

  const isSelf = userId === myId;
  const isBuiltin = builtin === '1';
  // 名人化身没有真人,不显示裁判入口
  const judgeable = !isSelf && !isBuiltin;

  const [profile, setProfile] = useState<UserProfile | null>(null);
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
  const displayName = profile?.username ?? username ?? 'TA';

  const subtitle = isSelf
    ? '我的化身 · 自聊'
    : isBuiltin
      ? '名人化身'
      : profile?.status
        ? `今日:${profile.status}`
        : profile
          ? `${profile.card_count} 张人格卡片`
          : null;

  const emptyTitle = isSelf ? '和自己的化身聊聊' : `向 ${displayName} 的化身打个招呼`;
  const emptyHint = isSelf
    ? '它由你的日记喂养。说点什么试试,看它像不像你——写的日记越多,它越像。'
    : isBuiltin
      ? '由人物设定驱动的化身,随便聊聊。'
      : `它会以 ${displayName} 的口吻和你聊。聊够几句后,可以请 AI 裁判评估你们合不合拍。`;

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
                { key: 'avatar', label: '化身' },
                { key: 'real', label: `${displayName} 本人` },
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
              title={
                turnsLeft !== null && turnsLeft > 0
                  ? `AI 裁判评估契合度 · 再聊 ${turnsLeft} 句`
                  : 'AI 裁判评估契合度'
              }
              onPress={evaluate}
              style={styles.flex}
            />
          )}
          {report && (
            <Pressable onPress={() => setShowReport(true)}>
              <Pill label={`${report.score} 分`} tone={report.passed ? 'success' : 'neutral'} />
            </Pressable>
          )}
        </View>
      )}
      {evaluating && (
        <Text style={[Type.caption1, styles.evaluating, { color: colors.textTertiary }]}>
          裁判在读你们的对话,约半分钟…
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
          onMessageSent={judgeable ? refreshJudge : undefined}
          onHistoryLoaded={(count) => setIntroExpanded(count === 0)}
          intro={
            judgeable && profile ? (
              <IntroCard profile={profile} expanded={introExpanded} onToggle={() => setIntroExpanded((v) => !v)} />
            ) : isSelf && profile && !profile.persona ? (
              <Card tone="tint" style={styles.intro}>
                <Text style={[Type.footnote, { color: colors.text }]}>
                  写一段「对外形象」,化身在别人面前会更像你想呈现的样子。
                </Text>
                <Button title="去写" variant="ghost" size="sm" onPress={() => router.push('/persona-editor')} style={styles.introAction} />
              </Card>
            ) : null
          }
        />
      )}

      {/* 契合度报告 */}
      <Sheet visible={showReport} onClose={() => setShowReport(false)} title="契合度报告">
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
              {report.passed
                ? `裁判认为你们聊得来,与 ${displayName} 本人的对话已解锁。`
                : '还没到解锁线(70 分)。多和化身聊聊,随时可以再评。'}
            </Text>
            <Button
              title={report.passed ? '去和本人聊' : '知道了'}
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
  introBody: { paddingHorizontal: 14, paddingBottom: 14, lineHeight: 22 },
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
