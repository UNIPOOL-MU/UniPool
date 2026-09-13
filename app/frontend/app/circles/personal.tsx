import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { circlesApi } from "@/src/api/circles";
import { BudgetRow, BudgetSummary, moneyV3Api } from "@/src/api/moneyV3";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";

const CATEGORIES = ["food", "groceries", "travel", "academics", "rent", "utilities", "entertainment", "shopping", "salary", "allowance", "refund", "other"];
const BUDGET_CATEGORIES = ["food", "groceries", "travel", "academics", "rent", "utilities", "entertainment", "shopping", "other"];
const money = (paise = 0) => `₹${(Math.abs(Number(paise || 0)) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const signedMoney = (paise = 0) => `${paise < 0 ? "−" : ""}${money(paise)}`;
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const titleCase = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : value;

export default function PersonalMoneyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("food");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingBudgetCategory, setEditingBudgetCategory] = useState<string | null>(null);
  const [budgetCategory, setBudgetCategory] = useState("food");
  const [budgetLimit, setBudgetLimit] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [ledgerResult, budgetResult] = await Promise.allSettled([circlesApi.personalDashboard(), moneyV3Api.budgets()]);
    if (ledgerResult.status === "fulfilled") setDashboard(ledgerResult.value);
    else Alert.alert("Couldn't load personal money", ledgerResult.reason?.message || "Try again");
    if (budgetResult.status === "fulfilled") setBudget(budgetResult.value);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveTransaction = async () => {
    const rupees = Number(amount);
    if (!description.trim()) return Alert.alert("Add a description", "For example: Mess dinner, allowance, books or cab.");
    if (!Number.isFinite(rupees) || rupees <= 0) return Alert.alert("Check amount", "Enter a valid amount above ₹0.");
    setSaving(true);
    try {
      await circlesApi.addPersonalTransaction({ kind, amount_paise: Math.round(rupees * 100), description: description.trim(), category, notes: notes.trim() || null });
      setAmount(""); setDescription(""); setNotes("");
      await load();
    } catch (e: any) { Alert.alert("Couldn't save transaction", e?.message || "Try again"); }
    finally { setSaving(false); }
  };

  const openNewBudget = () => {
    const used = new Set((budget?.budgets || []).map((row) => row.category));
    const firstFree = BUDGET_CATEGORIES.find((item) => !used.has(item)) || "other";
    setEditingBudgetCategory(null);
    setBudgetCategory(firstFree);
    setBudgetLimit("");
    setShowBudgetForm(true);
  };

  const openEditBudget = (row: BudgetRow) => {
    setEditingBudgetCategory(row.category);
    setBudgetCategory(row.category);
    setBudgetLimit((row.limit_paise / 100).toString());
    setShowBudgetForm(true);
  };

  const closeBudgetForm = () => {
    setShowBudgetForm(false);
    setEditingBudgetCategory(null);
    setBudgetLimit("");
  };

  const saveBudget = async () => {
    const rupees = Number(budgetLimit);
    if (!Number.isFinite(rupees) || rupees <= 0) return Alert.alert("Check budget", "Enter a monthly limit above ₹0.");
    setSaving(true);
    try {
      await moneyV3Api.setBudget(budgetCategory, Math.round(rupees * 100), budget?.month);
      closeBudgetForm();
      await load();
    } catch (e: any) { Alert.alert("Couldn't save budget", e?.message || "Try again"); }
    finally { setSaving(false); }
  };

  const removeBudgetNow = async (categoryName: string) => {
    try { await moneyV3Api.deleteBudget(categoryName, budget?.month); if (editingBudgetCategory === categoryName) closeBudgetForm(); await load(); }
    catch (e: any) { Alert.alert("Couldn't delete budget", e?.message || "Try again"); }
  };

  const confirmRemoveBudget = (row: BudgetRow) => {
    Alert.alert(
      `Delete ${titleCase(row.category)} budget?`,
      `This removes the ${money(row.limit_paise)} monthly limit. Your transactions stay untouched.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => removeBudgetNow(row.category) }],
    );
  };

  const removeTransaction = async (transactionId: string) => {
    try { await circlesApi.deletePersonalTransaction(transactionId); await load(); }
    catch (e: any) { Alert.alert("Couldn't remove transaction", e?.message || "Try again"); }
  };

  const income = Number(dashboard?.income_paise || budget?.income_paise || 0);
  const expense = Number(dashboard?.expense_paise || budget?.expense_paise || 0);
  const net = Number(dashboard?.net_cashflow_paise ?? income - expense);
  const transactions = dashboard?.transactions || [];
  const budgetRows = budget?.budgets || [];
  const largestCategory = Object.entries(budget?.spent_by_category || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.eyebrow}>PERSONAL MONEY</Text><Text style={styles.title}>Your monthly budget</Text><Text style={styles.sub}>Track cashflow, category limits and safe-to-spend guidance. Circle debts stay separate so they never distort this personal ledger.</Text></View>
    </View>

    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.indigo} /></View> : <>
      <Text style={styles.month}>{monthLabel(dashboard?.month || budget?.month || new Date().toISOString().slice(0, 7))}</Text>
      <View style={styles.metrics}>
        <Metric label="Money in" value={money(income)} icon="arrow-down-circle-outline" color={colors.success} styles={styles} />
        <Metric label="Money out" value={money(expense)} icon="arrow-up-circle-outline" color={colors.error} styles={styles} />
        <Metric label="Net cashflow" value={signedMoney(net)} icon="pulse-outline" color={net >= 0 ? colors.success : colors.error} styles={styles} />
        {budget ? <Metric label="Safe this week" value={money(budget.safe_to_spend_week_paise)} icon="calendar-outline" color={colors.indigo} styles={styles} /> : null}
      </View>

      {budget ? <View style={styles.budgetHero}>
        <View style={{ flex: 1 }}><Text style={styles.eyebrow}>BUDGET HEALTH</Text><Text style={styles.budgetHeroValue}>{budget.total_budget_paise ? `${money(budget.remaining_budget_paise)} left` : "Set your first limit"}</Text><Text style={styles.muted}>{budget.total_budget_paise ? `${money(budget.total_budget_paise)} monthly budget · ${money(budget.safe_to_spend_per_day_paise)} safe/day` : "Category budgets turn your personal ledger into a plan, not just a history."}</Text></View>
        <Pressable onPress={openNewBudget} style={styles.addBudgetButton} accessibilityLabel="Add new budget"><Ionicons name="add" size={22} color="#fff" /><Text style={styles.primaryText}>New budget</Text></Pressable>
      </View> : null}

      {showBudgetForm ? <View style={styles.form}>
        <View style={styles.formHead}><View><Text style={styles.formTitle}>{editingBudgetCategory ? `Edit ${titleCase(editingBudgetCategory)} budget` : "Add a budget"}</Text><Text style={styles.muted}>{editingBudgetCategory ? "Update this category's monthly limit." : "Choose a category and set its monthly cap."}</Text></View><Pressable onPress={closeBudgetForm} hitSlop={8}><Ionicons name="close" size={20} color={colors.muted} /></Pressable></View>
        {editingBudgetCategory ? <View style={styles.lockedCategory}><Ionicons name="pricetag-outline" size={15} color={colors.indigo} /><Text style={styles.lockedCategoryText}>{titleCase(editingBudgetCategory)}</Text></View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{BUDGET_CATEGORIES.map((item) => <Pressable key={item} onPress={() => setBudgetCategory(item)} style={[styles.category, budgetCategory === item && styles.categoryActive]}><Text style={[styles.categoryText, budgetCategory === item && { color: "#fff" }]}>{titleCase(item)}</Text></Pressable>)}</ScrollView>}
        <View style={styles.amountWrap}><Text style={styles.rupee}>₹</Text><TextInput value={budgetLimit} onChangeText={setBudgetLimit} keyboardType="decimal-pad" placeholder="Monthly limit" placeholderTextColor={colors.muted} style={styles.amountInput} /></View>
        <Pressable disabled={saving} onPress={saveBudget} style={[styles.primary, saving && { opacity: .6 }]}>{saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name={editingBudgetCategory ? "save-outline" : "add-circle-outline"} size={18} color="#fff" /><Text style={styles.primaryText}>{editingBudgetCategory ? "Save changes" : "Add budget"}</Text></>}</Pressable>
      </View> : null}

      {budget ? <View style={styles.sectionBlock}>
        <View style={styles.sectionHead}>
          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Category budgets</Text><Text style={styles.muted}>{largestCategory ? `Largest spend: ${titleCase(largestCategory[0])} · ${money(Number(largestCategory[1]))}` : "Set limits for the categories that matter to you."}</Text></View>
          <Pressable onPress={openNewBudget} style={styles.roundAdd} accessibilityLabel="Add budget"><Ionicons name="add" size={20} color="#fff" /></Pressable>
        </View>
        {budgetRows.length ? <View style={styles.list}>{budgetRows.map((row) => {
          const used = row.limit_paise > 0 ? Math.min(1, row.spent_paise / row.limit_paise) : 0;
          return <View key={row.category} style={styles.budgetRow}>
            <View style={styles.budgetTop}>
              <View style={{ flex: 1 }}><Text style={styles.txTitle}>{titleCase(row.category)}</Text><Text style={styles.muted}>{money(row.spent_paise)} spent of {money(row.limit_paise)}</Text></View>
              <Text style={[styles.budgetRemaining, row.over_paise > 0 && { color: colors.error }]}>{row.over_paise > 0 ? `${money(row.over_paise)} over` : `${money(row.remaining_paise)} left`}</Text>
              <View style={styles.rowActions}>
                <Pressable onPress={() => openEditBudget(row)} style={styles.actionIcon} accessibilityLabel={`Edit ${row.category} budget`}><Ionicons name="pencil-outline" size={16} color={colors.indigo} /></Pressable>
                <Pressable onPress={() => confirmRemoveBudget(row)} style={styles.actionIcon} accessibilityLabel={`Delete ${row.category} budget`}><Ionicons name="trash-outline" size={16} color={colors.error} /></Pressable>
              </View>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.round(used * 100)}%` as any }, row.over_paise > 0 && { backgroundColor: colors.error }]} /></View>
          </View>;
        })}</View> : <View style={styles.emptySmall}><Text style={styles.muted}>No category limits yet.</Text><Pressable onPress={openNewBudget} style={styles.emptyAdd}><Ionicons name="add-circle-outline" size={18} color={colors.indigo} /><Text style={styles.link}>Add your first budget</Text></Pressable></View>}
      </View> : null}

      <View style={styles.form}>
        <View style={styles.kindRow}>
          <Pressable onPress={() => setKind("expense")} style={[styles.kindBtn, kind === "expense" && { backgroundColor: colors.error }]}><Ionicons name="remove-circle-outline" size={17} color={kind === "expense" ? "#fff" : colors.error} /><Text style={[styles.kindText, { color: kind === "expense" ? "#fff" : colors.onSurface }]}>Expense</Text></Pressable>
          <Pressable onPress={() => setKind("income")} style={[styles.kindBtn, kind === "income" && { backgroundColor: colors.success }]}><Ionicons name="add-circle-outline" size={17} color={kind === "income" ? "#fff" : colors.success} /><Text style={[styles.kindText, { color: kind === "income" ? "#fff" : colors.onSurface }]}>Income / gain</Text></Pressable>
        </View>
        <Text style={styles.formTitle}>{kind === "expense" ? "Add an expense" : "Add money received"}</Text>
        <View style={styles.row}><View style={styles.amountWrap}><Text style={styles.rupee}>₹</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.amountInput} /></View><TextInput value={description} onChangeText={setDescription} placeholder={kind === "expense" ? "What did you spend on?" : "Where did the money come from?"} placeholderTextColor={colors.muted} style={[styles.input, { flex: 2 }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{CATEGORIES.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.category, category === item && styles.categoryActive]}><Text style={[styles.categoryText, category === item && { color: "#fff" }]}>{titleCase(item)}</Text></Pressable>)}</ScrollView>
        <TextInput value={notes} onChangeText={setNotes} placeholder="Optional note" placeholderTextColor={colors.muted} style={styles.input} />
        <Pressable disabled={saving} onPress={saveTransaction} style={[styles.primary, saving && { opacity: .6 }]}>{saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.primaryText}>Save {kind}</Text></>}</Pressable>
      </View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Recent transactions</Text><Text style={styles.muted}>Your personal ledger only.</Text></View></View>
      <View style={styles.list}>{transactions.map((item: any) => <View key={item.transaction_id} style={styles.transaction}>
        <View style={styles.txIcon}><Ionicons name={item.kind === "income" ? "arrow-down" : "arrow-up"} size={17} color={item.kind === "income" ? colors.success : colors.error} /></View>
        <View style={{ flex: 1 }}><Text style={styles.txTitle}>{item.description}</Text><Text style={styles.muted}>{titleCase(item.category)} · {new Date(item.occurred_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text></View>
        <Text style={[styles.txAmount, { color: item.kind === "income" ? colors.success : colors.onSurface }]}>{item.kind === "income" ? "+" : "−"}{money(item.amount_paise)}</Text>
        <Pressable onPress={() => removeTransaction(item.transaction_id)} hitSlop={10} accessibilityLabel={`Remove ${item.description}`}><Ionicons name="trash-outline" size={16} color={colors.muted} /></Pressable>
      </View>)}</View>
      {!transactions.length ? <View style={styles.empty}><Ionicons name="receipt-outline" size={28} color={colors.indigo} /><Text style={styles.formTitle}>No personal transactions yet</Text><Text style={styles.muted}>Add your first expense or income above.</Text></View> : null}
    </>}
  </ScrollView></SafeAreaView>;
}

function Metric({ label, value, icon, color, styles }: any) { return <View style={styles.metric}><Ionicons name={icon} size={19} color={color} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const makeStyles = (c: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 980, alignSelf: "center", padding: SPACING.lg, paddingBottom: 140 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 20 }, iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 29, fontWeight: "900", marginTop: 4 }, sub: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 680 },
  loading: { minHeight: 260, alignItems: "center", justifyContent: "center" }, month: { color: c.muted, fontSize: 11, fontWeight: "800", marginBottom: 8 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }, metric: { flexGrow: 1, flexBasis: 155, minHeight: 98, padding: 14, borderRadius: RADIUS.lg, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, metricValue: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: "900", marginTop: 8 }, metricLabel: { color: c.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  budgetHero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: RADIUS.lg, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, marginBottom: 14 }, budgetHeroValue: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: "900", marginVertical: 3 }, addBudgetButton: { minHeight: 42, borderRadius: 22, paddingHorizontal: 15, backgroundColor: c.indigo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, roundAdd: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" },
  sectionBlock: { marginBottom: 18 }, sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6, marginBottom: 9 }, sectionTitle: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: "900" }, muted: { color: c.muted, fontSize: 10, lineHeight: 15 },
  list: { gap: 8 }, budgetRow: { padding: 13, borderRadius: RADIUS.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, budgetTop: { flexDirection: "row", alignItems: "center", gap: 10 }, budgetRemaining: { color: c.success, fontSize: 10, fontWeight: "900" }, rowActions: { flexDirection: "row", gap: 5 }, actionIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border }, track: { height: 6, borderRadius: 3, backgroundColor: c.surface2, overflow: "hidden", marginTop: 10 }, fill: { height: "100%", borderRadius: 3, backgroundColor: c.indigo },
  form: { padding: 15, borderRadius: RADIUS.lg, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, marginBottom: 18, gap: 10 }, formHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }, formTitle: { color: c.onSurface, fontSize: 14, fontWeight: "900" },
  lockedCategory: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 11, borderRadius: 18, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }, lockedCategoryText: { color: c.onSurface, fontWeight: "800", fontSize: 11 },
  categories: { gap: 7 }, category: { minHeight: 34, borderRadius: 17, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }, categoryActive: { backgroundColor: c.indigo, borderColor: c.indigo }, categoryText: { color: c.onSurface, fontSize: 10, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" }, amountWrap: { flex: 1, minWidth: 125, flexDirection: "row", alignItems: "center", minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 11 }, rupee: { color: c.onSurface, fontSize: 16, fontWeight: "900", marginRight: 5 }, amountInput: { flex: 1, color: c.onSurface, fontSize: 15, fontWeight: "800", outlineStyle: "none" } as any, input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, color: c.onSurface, paddingHorizontal: 12, fontSize: 12, outlineStyle: "none" } as any,
  primary: { minHeight: 44, borderRadius: 22, backgroundColor: c.indigo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, primaryText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  kindRow: { flexDirection: "row", gap: 8 }, kindBtn: { flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, kindText: { fontSize: 10, fontWeight: "900" },
  transaction: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: RADIUS.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, txIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, txTitle: { color: c.onSurface, fontSize: 11, fontWeight: "900" }, txAmount: { fontSize: 11, fontWeight: "900" },
  emptySmall: { minHeight: 100, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.border, alignItems: "center", justifyContent: "center", gap: 8, padding: 14 }, emptyAdd: { flexDirection: "row", alignItems: "center", gap: 5 }, link: { color: c.indigo, fontSize: 10, fontWeight: "900" }, empty: { minHeight: 150, borderRadius: RADIUS.lg, borderWidth: 1, borderStyle: "dashed", borderColor: c.border, alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
});
