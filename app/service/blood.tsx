import { safeGoBack } from "@/lib/safe-navigation";
import { onValueWithCache as onValue } from "@/lib/rtdb-cache";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { get, limitToLast, orderByChild, push, query, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { BloodDonorFilters } from "@/components/blood-donor-filters";
import { pathargataAuth, pathargataDb } from "@/lib/pathargata-firebase";
import { filterBloodDonors, getBloodUnionFilterOptions } from "@/lib/blood-filters";
import { BLOOD_REQUEST_STATUS_LABELS, canNotifyDonor, getOwnDonorDeletionPath, getPrivateBloodRequestPath, isBloodRequestStatus, normalizeBangladeshMobile, type BloodRequestStatus, type DonorResponse } from "@/lib/blood-donor";

type Donor = { id: string; uid: string; name: string; bloodGroup: string; phone?: string; union?: string; village?: string; lastDate?: string; serviceArea?: string; receiveBloodRequestNotifications?: boolean; temporarilyUnavailable?: boolean };
type Request = { id: string; uid?: string; trackingId?: string; bloodGroup: string; area: string; hospital?: string; patientName?: string; units?: string; urgency?: string; details?: string; neededAt: string; status: BloodRequestStatus; timestamp: number; updatedAt?: number; expiresAt?: number; responses?: Record<string, { response?: DonorResponse }> };
type PrivateBloodRequest = { patientName?: string; hospital?: string; details?: string; contact?: string; requesterName?: string };
const groups = ["সব", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const inputClass = "rounded-2xl border border-border bg-surface px-4 py-3 text-foreground";
const statusText: Record<string, string> = { new: "নতুন — যাচাইয়ের অপেক্ষায়", verification_in_progress: "যাচাই চলছে", awaiting_donor_response: "ডোনারের উত্তরের অপেক্ষায়", donor_responded: "ডোনার সাড়া দিয়েছেন", arrangements_confirmed: "ব্যবস্থা নিশ্চিত", completed: "সম্পন্ন", cancelled: "বাতিল", expired: "সময় শেষ" };
const urgencyOptions = [{ id: "critical", label: "এখনই", color: "#B91C1C" }, { id: "today", label: "আজকের মধ্যে", color: "#C2410C" }, { id: "planned", label: "আগাম প্রস্তুতি", color: "#2563EB" }];
function trackingId() { const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); return `BLD-${date}-${Math.floor(1000 + Math.random() * 9000)}`; }
function nowMs() { return Date.now(); }
function records(value: unknown) { return value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).filter(([, v]) => v && typeof v === "object") : []; }
function available(lastDate?: string) { if (!lastDate) return true; const date = Date.parse(lastDate); return !Number.isFinite(date) || Math.floor((Date.now() - date) / 86400000) >= 120; }
function ago(timestamp?: number) { if (!timestamp) return "সাম্প্রতিক"; const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000)); return minutes < 60 ? `${minutes} মিনিট আগে` : `${Math.floor(minutes / 60)} ঘণ্টা আগে`; }
function CheckRow({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) { return <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={onPress} className="flex-row items-start mt-4"><Ionicons name={value ? "checkbox" : "square-outline"} size={22} color="#DC2626" /><Text className="ml-2 flex-1 text-sm text-foreground">{label}</Text></TouchableOpacity>; }

export default function BloodServiceScreen() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const [donors, setDonors] = useState<Donor[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [group, setGroup] = useState("সব");
  const [unionFilter, setUnionFilter] = useState("সব");
  const [tab, setTab] = useState<"donors" | "requests">(requestId ? "requests" : "donors");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"donor" | "request" | null>(null);
  const [saving, setSaving] = useState(false);
  const [legacyDonorNeedsRepublish, setLegacyDonorNeedsRepublish] = useState(false);
  const [error, setError] = useState("");
  const [donorForm, setDonorForm] = useState({ bloodGroup: "A+", phone: "", lastDate: "", serviceArea: "", receive: false, unavailable: false });
  const [requestForm, setRequestForm] = useState({ bloodGroup: "A+", patientName: "", hospital: "", area: "", units: "1", urgency: "critical", neededAt: "", contact: "", details: "" });
  const [requestLimit, setRequestLimit] = useState(20);
  const currentUid = pathargataAuth.currentUser?.uid;

  useFocusEffect(useCallback(() => {
    const donorUnsubscribe = onValue(query(ref(pathargataDb, "donors_public"), limitToLast(150)), (snapshot) => {
      setDonors(records(snapshot.val()).map(([id, value]) => { const item = value as Record<string, unknown>; return { id, uid: String(item.uid || id), name: String(item.name || "রক্তদাতা"), bloodGroup: String(item.bloodGroup || "অজানা"), phone: item.phone ? String(item.phone) : undefined, union: item.union ? String(item.union) : undefined, village: item.village ? String(item.village) : undefined, lastDate: item.lastDate ? String(item.lastDate) : undefined, serviceArea: item.serviceArea ? String(item.serviceArea) : undefined, receiveBloodRequestNotifications: item.receiveBloodRequestNotifications === true, temporarilyUnavailable: item.temporarilyUnavailable === true }; })); setLoading(false);
    }, () => setLoading(false));
    const requestUnsubscribe = onValue(query(ref(pathargataDb, "blood_requests"), orderByChild("createdAt"), limitToLast(requestLimit)), (snapshot) => {
      const next = records(snapshot.val()).map(([id, value]) => { const item = value as Record<string, any>; const rawStatus = isBloodRequestStatus(item.status) ? item.status : "new"; const expiresAt = Number(item.expiresAt || 0); const status = expiresAt > 0 && expiresAt < Date.now() && rawStatus !== "completed" && rawStatus !== "cancelled" ? "expired" : rawStatus; return { id, uid: item.requesterUid || item.uid ? String(item.requesterUid || item.uid) : undefined, trackingId: item.trackingId ? String(item.trackingId) : undefined, bloodGroup: String(item.bloodGroup || "অজানা"), area: String(item.area || item.location || "এলাকা উল্লেখ নেই"), units: item.units ? String(item.units) : undefined, urgency: item.urgency ? String(item.urgency) : undefined, neededAt: String(item.neededAt || "সময় উল্লেখ নেই"), status, timestamp: Number(item.createdAt || item.timestamp || 0), updatedAt: Number(item.updatedAt || 0), expiresAt: Number(item.expiresAt || 0), responses: item.responses && typeof item.responses === "object" ? item.responses : undefined } as Request; });
      next.sort((a, b) => b.timestamp - a.timestamp); setRequests(next);
      if (!currentUid) return;
      void Promise.all(next.filter((item) => item.uid === currentUid).map(async (item) => {
        const privateSnapshot = await get(ref(pathargataDb, `blood_request_private/${item.id}`)).catch(() => null);
        const privateData = privateSnapshot?.val() as PrivateBloodRequest | null;
        return privateData ? { ...item, ...privateData } : item;
      })).then((ownRequests) => {
        if (!ownRequests.length) return;
        const byId = new Map(ownRequests.map((item) => [item.id, item]));
        setRequests((current) => current.map((item) => byId.get(item.id) || item));
      });
    });
    return () => { donorUnsubscribe(); requestUnsubscribe(); };
  }, [currentUid, requestLimit]));

  const unionOptions = useMemo(() => getBloodUnionFilterOptions(donors), [donors]);
  const filteredDonors = useMemo(() => filterBloodDonors(donors, group, unionFilter), [donors, group, unionFilter]);
  const ownDonor = donors.find((item) => item.uid === currentUid);

  async function completeRequest(item: Request) { if (item.uid !== currentUid || item.status === "completed" || item.status === "cancelled") return; try { const now = Date.now(); await update(ref(pathargataDb, `blood_requests/${item.id}`), { status: "completed", updatedAt: now, nextAction: "রক্ত পাওয়া গেছে — request সম্পন্ন" }); Alert.alert("সম্পন্ন", "রক্তের request সম্পন্ন হিসেবে চিহ্নিত হয়েছে।"); } catch { Alert.alert("সমস্যা হয়েছে", "Request সম্পন্ন করা যায়নি।"); } }

  async function openDonor() {
    let privateDonor: Record<string, unknown> = {};
    if (currentUid) {
      try { privateDonor = ((await get(ref(pathargataDb, `donors/${currentUid}`))).val() || {}) as Record<string, unknown>; }
      catch { /* Existing public donor data can still be edited if the private lookup is unavailable. */ }
    }
    const savedDonor = { ...privateDonor, ...ownDonor };
    const hasSavedDonor = Boolean(ownDonor) || Object.keys(privateDonor).length > 0;
    setLegacyDonorNeedsRepublish(!ownDonor && Object.keys(privateDonor).length > 0);
    const savedGroup = typeof savedDonor.bloodGroup === "string" && groups.includes(savedDonor.bloodGroup) ? savedDonor.bloodGroup : "A+";
    setDonorForm(hasSavedDonor ? {
      bloodGroup: savedGroup,
      phone: typeof privateDonor.phone === "string" ? privateDonor.phone : "",
      lastDate: typeof savedDonor.lastDate === "string" ? savedDonor.lastDate : "",
      serviceArea: typeof savedDonor.serviceArea === "string" ? savedDonor.serviceArea : typeof savedDonor.union === "string" ? savedDonor.union : "",
      receive: savedDonor.receiveBloodRequestNotifications === true,
      unavailable: savedDonor.temporarilyUnavailable === true,
    } : { bloodGroup: "A+", phone: "", lastDate: "", serviceArea: "", receive: false, unavailable: false });
    setError(""); setModal("donor");
  }

  async function saveDonor() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (!donorForm.phone || !/^01[3-9]\d{8}$/.test(donorForm.phone.trim())) { setError("সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।"); return; }
    if (donorForm.receive && !donorForm.serviceArea.trim()) { setError("যে এলাকায় সাড়া দিতে পারবেন সেই এলাকা লিখুন।"); return; }
    if (donorForm.serviceArea.trim().length > 160 || donorForm.lastDate.trim().length > 32) { setError("এলাকা ১৬০ অক্ষর এবং শেষ রক্তদানের তারিখ ৩২ অক্ষরের মধ্যে লিখুন।"); return; }
    setSaving(true); setError("");
    try {
      const profile = (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
      const timestamp = Date.now();
      const donorName = String(profile.name || user.displayName || "Pathargata user").slice(0, 160);
      await update(ref(pathargataDb), {
        [`donors/${user.uid}`]: { uid: user.uid, name: donorName, bloodGroup: donorForm.bloodGroup, phone: donorForm.phone.trim(), hidePhone: true, lastDate: donorForm.lastDate.trim(), union: profile.union || "", village: profile.village || "", serviceArea: donorForm.serviceArea.trim(), receiveBloodRequestNotifications: donorForm.receive, temporarilyUnavailable: donorForm.unavailable, consentUpdatedAt: timestamp, timestamp },
        [`donors_public/${user.uid}`]: { uid: user.uid, name: donorName, bloodGroup: donorForm.bloodGroup, lastDate: donorForm.lastDate.trim(), union: profile.union || "", village: profile.village || "", serviceArea: donorForm.serviceArea.trim(), receiveBloodRequestNotifications: donorForm.receive, temporarilyUnavailable: donorForm.unavailable, timestamp },
      });
      setLegacyDonorNeedsRepublish(false); setModal(null); Alert.alert("সংরক্ষিত", "আপনার সম্মতি ও ডোনার পছন্দ সংরক্ষণ হয়েছে। ফোন নম্বর তালিকায় দেখানো হবে না।");
    } catch { setError("তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"); } finally { setSaving(false); }
  }

  async function removeDonor() {
    const path = getOwnDonorDeletionPath(currentUid, ownDonor?.uid);
    if (!path) return;
    try { await update(ref(pathargataDb), { [path]: null, [`donors_public/${currentUid}`]: null }); Alert.alert("সম্পন্ন", "ডোনার তথ্য সরানো হয়েছে।"); }
    catch { Alert.alert("সমস্যা হয়েছে", "ডোনার তথ্য সরানো যায়নি।"); }
  }

  async function sendRequest() {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    const contact = normalizeBangladeshMobile(requestForm.contact.trim());
    const hospital = requestForm.hospital.trim();
    if (!requestForm.area.trim() || !hospital || hospital.length > 200 || !requestForm.neededAt.trim()) { setError("হাসপাতাল/ক্লিনিক, এলাকা এবং কখন রক্ত প্রয়োজন—এই আবশ্যক তথ্যগুলো দিন।"); return; }
    if (!contact) { setError("যোগাযোগ নম্বরটি আবশ্যক—এটি শুধু প্রশাসক দেখতে পারবেন।"); return; }
    if (!/^01[3-9]\d{8}$/.test(contact)) { setError("বাংলাদেশের সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (যেমন 01712345678)। বাংলা বা ইংরেজি অঙ্ক—দুটিই গ্রহণযোগ্য।"); return; }
    setSaving(true); setError("");
    try {
      const profile = (await get(ref(pathargataDb, `users/${user.uid}`))).val() || {};
      const requestRef = push(ref(pathargataDb, "blood_requests"));
      const id = requestRef.key;
      if (!id) throw new Error("request key missing");
      const now = Date.now();
      const idCode = trackingId(); const publicRecord = { requesterUid: user.uid, trackingId: idCode, bloodGroup: requestForm.bloodGroup, area: requestForm.area.trim(), units: requestForm.units.trim() || "1", urgency: requestForm.urgency, neededAt: requestForm.neededAt.trim(), status: "new", verificationStatus: "pending", nextAction: "Admin যাচাই করে উপযুক্ত ডোনার নির্বাচন করবেন", createdAt: now, updatedAt: now, expiresAt: now + (requestForm.urgency === "critical" ? 24 : 72) * 60 * 60 * 1000, updatedBy: user.uid };
      const privateRecord = { requesterUid: user.uid, contact, requesterName: String(profile.name || user.displayName || "").slice(0, 160), patientName: requestForm.patientName.trim().slice(0, 160), hospital, details: requestForm.details.trim().slice(0, 2000), createdAt: now };
      const publicRef = ref(pathargataDb, `blood_requests/${id}`);
      await set(publicRef, publicRecord);
      try {
        await set(ref(pathargataDb, getPrivateBloodRequestPath(id)), privateRecord);
      } catch (error) {
        await remove(publicRef).catch(() => undefined);
        throw error;
      }
      setModal(null); setRequestForm({ bloodGroup: "A+", patientName: "", hospital: "", area: "", units: "1", urgency: "critical", neededAt: "", contact: "", details: "" });
      Alert.alert("অনুরোধ জমা হয়েছে", `Tracking ID: ${idCode}\nপ্রথমে অনুমোদিত রক্তসেবা সমন্বয়কারী অনুরোধ যাচাই করবেন। যাচাইয়ের আগে ডোনারদের কাছে অনুরোধ যাবে না।`);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : String(submitError || "");
      setError(/permission_denied|permission denied/i.test(message)
        ? "সার্ভারের নিরাপত্তা নিয়ম request আটকে দিয়েছে। অ্যাপটি হালনাগাদ আছে কি না দেখুন; সমস্যা থাকলে প্রশাসককে Firebase rules প্রকাশ করতে হবে।"
        : "রিকোয়েস্ট পাঠানো যায়নি—ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।");
    } finally { setSaving(false); }
  }

  async function respond(requestId: string, response: DonorResponse) {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    if (response !== "can_donate") {
      await saveDonorResponse(requestId, response, false);
      return;
    }
    const tracking = requests.find((item) => item.id === requestId)?.trackingId || "এই অনুরোধ";
    Alert.alert(
      "এই অনুরোধে ফোন নম্বর শেয়ার করবেন?",
      `${tracking}-এর জন্য আপনার private ডোনার প্রোফাইলে থাকা ফোন নম্বর শুধু এই রক্তের অনুরোধ সমন্বয়কারীকে দিতে পারেন। নম্বরটি সবার কাছে বা অন্য অনুরোধে দেখানো হবে না; পরে সম্মতি প্রত্যাহার করা যাবে।`,
      [
        { text: "ফিরে যান", style: "cancel" },
        { text: "শুধু সাড়া পাঠাই", onPress: () => void saveDonorResponse(requestId, response, false) },
        { text: "সাড়া ও নম্বর শেয়ার", onPress: () => void saveDonorResponse(requestId, response, true) },
      ],
    );
  }

  async function saveDonorResponse(requestId: string, response: DonorResponse, sharePhone: boolean) {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    let shareRecord: Record<string, unknown> | null = null;
    if (response === "can_donate" && sharePhone) {
      try {
        const donorSnapshot = await get(ref(pathargataDb, `donors/${user.uid}`));
        const donor = (donorSnapshot.val() || {}) as Record<string, unknown>;
        const phone = normalizeBangladeshMobile(String(donor.phone || ""));
        if (!phone) throw new Error("আপনার private ডোনার প্রোফাইলে সঠিক ফোন নম্বর নেই। আগে ডোনার তথ্য আপডেট করুন, অথবা নম্বর না শেয়ার করে শুধু সাড়া পাঠান।");
        shareRecord = {
          requestId,
          donorUid: user.uid,
          donorName: String(donor.name || user.displayName || "রক্তদাতা").slice(0, 160),
          phone,
          consentAt: nowMs(),
          consentStatus: "active",
          consentTextVersion: "blood-contact-share-v1",
        };
      } catch (error) {
        Alert.alert("ফোন নম্বর যাচাই হয়নি", error instanceof Error ? error.message : "ডোনার তথ্য পড়া যায়নি।");
        return;
      }
    }
    try {
      await update(ref(pathargataDb), {
        [`blood_requests/${requestId}/responses/${user.uid}`]: { response, updatedAt: serverTimestamp() },
        ...(response === "can_donate" ? { [`blood_requests/${requestId}/status`]: "donor_responded", [`blood_requests/${requestId}/updatedAt`]: nowMs() } : {}),
      });
    } catch {
      Alert.alert("পাঠানো যায়নি", "আবার চেষ্টা করুন।");
      return;
    }
    try {
      const shareRef = ref(pathargataDb, `blood_contact_shares/${requestId}/${user.uid}`);
      if (shareRecord) await set(shareRef, shareRecord);
      else {
        const existingShare = await get(shareRef);
        if (existingShare.exists()) await remove(shareRef);
      }
    } catch {
      Alert.alert("উত্তর পাঠানো হয়েছে", "আপনার ফোন-শেয়ার সম্মতি সংরক্ষণ করা যায়নি। নম্বর coordinator-এর কাছে প্রকাশ হয়নি; আবার চেষ্টা করুন।");
      return;
    }
    Alert.alert(
      "উত্তর পাঠানো হয়েছে",
      shareRecord ? "এই অনুরোধের জন্য আপনার সম্মতিতে ফোন নম্বর coordinator-কে দেওয়া হয়েছে।" : "আপনার উত্তর coordinator দেখতে পারবেন; ফোন নম্বর শেয়ার করা হয়নি।",
    );
  }

  async function updateContactShareConsent(requestId: string, allow: boolean) {
    const user = pathargataAuth.currentUser;
    if (!user) { router.push("/auth"); return; }
    try {
      const responseSnapshot = await get(ref(pathargataDb, `blood_requests/${requestId}/responses/${user.uid}`));
      if (responseSnapshot.child("response").val() !== "can_donate") throw new Error("এই অনুরোধে আগে ‘সাড়া দিতে পারব’ উত্তর দিতে হবে।");
      const shareRef = ref(pathargataDb, `blood_contact_shares/${requestId}/${user.uid}`);
      if (allow) {
        const donorSnapshot = await get(ref(pathargataDb, `donors/${user.uid}`));
        const donor = (donorSnapshot.val() || {}) as Record<string, unknown>;
        const phone = normalizeBangladeshMobile(String(donor.phone || ""));
        if (!phone) throw new Error("আপনার private ডোনার প্রোফাইলে সঠিক ফোন নম্বর নেই। আগে ডোনার তথ্য আপডেট করুন।");
        await set(shareRef, {
          requestId,
          donorUid: user.uid,
          donorName: String(donor.name || user.displayName || "রক্তদাতা").slice(0, 160),
          phone,
          consentAt: nowMs(),
          consentStatus: "active",
          consentTextVersion: "blood-contact-share-v1",
        });
        Alert.alert("সম্মতি সংরক্ষিত", "ফোন নম্বর শুধু এই অনুরোধের coordinator দেখতে পারবেন।");
      } else {
        const existingShare = await get(shareRef);
        if (existingShare.exists()) await remove(shareRef);
        Alert.alert("সম্মতি প্রত্যাহার করা হয়েছে", "এই অনুরোধে আপনার ফোন নম্বরের share মুছে দেওয়া হয়েছে।");
      }
    } catch (error) {
      Alert.alert("সম্মতি আপডেট হয়নি", error instanceof Error ? error.message : "আবার চেষ্টা করুন।");
    }
  }

  function manageContactSharing(requestId: string) {
    const request = requests.find((item) => item.id === requestId);
    const tracking = request?.trackingId || "এই অনুরোধ";
    const closed = request?.status === "completed" || request?.status === "cancelled" || request?.status === "expired";
    const actions = [
      { text: "পরে", style: "cancel" as const },
      { text: "সম্মতি প্রত্যাহার", style: "destructive" as const, onPress: () => void updateContactShareConsent(requestId, false) },
      ...(!closed ? [{ text: "নম্বর শেয়ার করুন", onPress: () => void updateContactShareConsent(requestId, true) }] : []),
    ];
    Alert.alert(
      `${tracking}-এ ফোন শেয়ার`,
      closed
        ? "অনুরোধটি বন্ধ হয়েছে। আগের সম্মতি থাকলে আপনি শুধু সেটি প্রত্যাহার করতে পারবেন।"
        : "এই নম্বর শুধু এই অনুরোধের coordinator দেখতে পারবেন। আপনি চাইলে এখন share করতে বা আগের সম্মতি প্রত্যাহার করতে পারেন।",
      actions,
    );
  }

  async function cancelRequest(item: Request) {
    if (item.uid !== currentUid || item.status === "completed") return;
    try { await update(ref(pathargataDb), { [`blood_requests/${item.id}`]: null, [`blood_request_private/${item.id}`]: null }); }
    catch { Alert.alert("সমস্যা হয়েছে", "অনুরোধ বাতিল করা যায়নি।"); }
  }

  const visibleRequests = requests.filter((item) => {
    if (item.uid === currentUid) return true;
    const myResponse = currentUid ? item.responses?.[currentUid]?.response : undefined;
    const waitingForDonors = item.status === "awaiting_donor_response" && Boolean(ownDonor && canNotifyDonor(ownDonor, { bloodGroup: item.bloodGroup, area: item.area }));
    return waitingForDonors || myResponse === "can_donate";
  });
  const orderedRequests = requestId ? [...visibleRequests].sort((a, b) => (a.id === requestId ? -1 : b.id === requestId ? 1 : 0)) : visibleRequests;
  function loadMoreRequests() { if (requests.length >= requestLimit) setRequestLimit((value) => value + 20); }
  return <ScreenContainer className="bg-background">
    <View className="px-5 pt-3 pb-4 flex-row items-center border-b border-border"><TouchableOpacity className="h-11 w-11 rounded-2xl bg-surface border border-border items-center justify-center" onPress={() => safeGoBack("/(tabs)/services")}><Ionicons name="arrow-back" size={21} color="#334155" /></TouchableOpacity><View className="ml-3 flex-1"><Text className="text-xl font-extrabold text-foreground">রক্ত সেবা</Text></View><TouchableOpacity accessibilityLabel="রক্তের অনুরোধ জমা দিন" className="h-11 w-11 rounded-2xl bg-red-50 items-center justify-center" onPress={() => { setError(""); setModal("request"); }}><Ionicons name="add" size={24} color="#DC2626" /></TouchableOpacity></View><LinearGradient colors={["#B91C1C", "#EF4444", "#991B1B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="mx-5 mt-3 overflow-hidden rounded-3xl px-5 py-5"><View className="flex-row items-center"><View className="relative h-16 w-16 items-center justify-center"><Ionicons name="heart" size={60} color="#FFFFFF" /><Ionicons name="pulse" size={31} color="#DC2626" /></View><View className="ml-4 flex-1"><Text className="text-xl font-extrabold text-white">রক্ত দিন, জীবন বাঁচান</Text><Text className="mt-1 text-[13px] leading-5 text-red-100">আপনার এলাকার রক্তদাতা খুঁজুন অথবা জরুরি অনুরোধ জানান</Text></View></View></LinearGradient><View className="px-5 pt-4"><View className="flex-row rounded-2xl bg-surface border border-border p-1"><TouchableOpacity className={`flex-1 rounded-xl py-3 items-center ${tab === "donors" ? "bg-red-600" : ""}`} onPress={() => setTab("donors")}><Text className={`font-bold ${tab === "donors" ? "text-white" : "text-muted"}`}>ডোনার ({donors.length})</Text></TouchableOpacity><TouchableOpacity className={`flex-1 rounded-xl py-3 items-center ${tab === "requests" ? "bg-red-600" : ""}`} onPress={() => setTab("requests")}><Text className={`font-bold ${tab === "requests" ? "text-white" : "text-muted"}`}>অনুরোধ ({visibleRequests.length})</Text></TouchableOpacity></View>
      {tab === "donors" ? <BloodDonorFilters groups={groups} group={group} onGroupChange={setGroup} union={unionFilter} onUnionChange={setUnionFilter} unionOptions={unionOptions} visibleCount={filteredDonors.length} isDonor={Boolean(ownDonor)} onOpenDonor={openDonor} /> : null}
    </View>
    {tab === "donors" ? <FlatList data={filteredDonors} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: 30 }} ListEmptyComponent={loading ? <ActivityIndicator color="#DC2626" /> : <View className="items-center pt-20"><Ionicons name="water-outline" size={58} color="#CBD5E1" /><Text className="font-bold text-foreground mt-4">কোনো ডোনার পাওয়া যায়নি</Text></View>} renderItem={({ item }) => <View className="rounded-3xl bg-surface border border-border p-4 mb-3"><View className="flex-row items-center"><View className="h-12 w-12 rounded-2xl bg-red-50 items-center justify-center"><Text className="text-base font-bold text-red-600">{item.bloodGroup}</Text></View><View className="ml-3 flex-1"><Text className="font-extrabold text-foreground">{item.name}</Text><Text className="text-xs text-muted mt-1">{[item.union, item.village].filter(Boolean).join(" · ") || "এলাকা উল্লেখ নেই"}</Text></View><View className={`rounded-full px-2 py-1 ${available(item.lastDate) && !item.temporarilyUnavailable ? "bg-green-50" : "bg-orange-50"}`}><Text className={`text-[12px] font-bold ${available(item.lastDate) && !item.temporarilyUnavailable ? "text-green-700" : "text-orange-700"}`}>{item.temporarilyUnavailable ? "সাময়িক অনুপলব্ধ" : available(item.lastDate) ? "সাড়া দিতে পারেন" : "১২০ দিন অপেক্ষা"}</Text></View></View>{item.lastDate ? <Text className="text-xs text-muted mt-3">শেষ রক্তদান: {item.lastDate}</Text> : null}{item.uid === currentUid ? <View className="flex-row gap-2 mt-3"><TouchableOpacity className="flex-1 rounded-2xl bg-red-50 py-3 items-center" onPress={openDonor}><Text className="font-bold text-red-600">পছন্দ/তথ্য</Text></TouchableOpacity><TouchableOpacity className="flex-1 rounded-2xl border border-red-200 py-3 items-center" onPress={() => Alert.alert("ডোনার তথ্য সরাবেন?", "আপনার ডোনার তথ্য তালিকা থেকে মুছে যাবে।", [{ text: "রাখুন", style: "cancel" }, { text: "সরান", style: "destructive", onPress: () => void removeDonor() }])}><Text className="font-bold text-red-600">তালিকা থেকে সরান</Text></TouchableOpacity></View> : null}</View>} /> : <FlatList data={orderedRequests} keyExtractor={(item) => item.id} contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 30 }} onEndReached={loadMoreRequests} onEndReachedThreshold={0.6} ListEmptyComponent={<View className="items-center pt-16"><Ionicons name="heart-outline" size={58} color="#CBD5E1" /><Text className="font-bold text-foreground mt-4">এখন কোনো যাচাইকৃত অনুরোধ নেই</Text></View>} renderItem={({ item }) => { const response = currentUid ? item.responses?.[currentUid]?.response : undefined; const canRespond = item.uid !== currentUid && item.status === "awaiting_donor_response"; const canManageConsent = item.uid !== currentUid && response === "can_donate"; return <View className={`rounded-3xl p-4 mb-3 ${item.id === requestId ? "bg-red-100 border-2 border-red-600" : "bg-red-50 border border-red-100"}`}><View className="flex-row items-center"><Text className="rounded-xl bg-red-600 px-3 py-2 text-white font-bold">{item.bloodGroup}</Text><Text className="text-xs text-muted ml-3">{ago(item.timestamp)}</Text>{item.uid === currentUid && item.status !== "completed" ? <TouchableOpacity className="ml-auto" onPress={() => Alert.alert("অনুরোধ বাতিল করবেন?", "অনুরোধ ও সংরক্ষিত যোগাযোগের তথ্য মুছে যাবে।", [{ text: "ফিরে যান", style: "cancel" }, { text: "বাতিল করুন", style: "destructive", onPress: () => void cancelRequest(item) }])}><Ionicons name="trash-outline" size={20} color="#DC2626" /></TouchableOpacity> : null}{item.uid === currentUid && item.status !== "completed" && item.status !== "cancelled" && item.status !== "expired" ? <TouchableOpacity className="ml-auto" onPress={() => void completeRequest(item)}><Ionicons name="checkmark-circle-outline" size={20} color="#16A34A" /></TouchableOpacity> : null}</View><Text className="text-base font-bold text-foreground mt-3">{item.hospital || item.area}</Text><Text className="text-sm text-muted mt-1">এলাকা: {item.area} · প্রয়োজন: {item.neededAt}</Text>{item.trackingId ? <Text className="text-[12px] font-extrabold text-red-700 mt-2">Tracking ID: {item.trackingId}</Text> : null}{item.id === requestId ? <Text className="text-xs font-bold text-red-800 mt-2">notification থেকে খোলা অনুরোধ</Text> : null}{item.units ? <Text className="text-xs text-muted mt-2">প্রয়োজন: {item.units} bag</Text> : null}<Text className="text-xs font-semibold text-red-800 mt-3">জরুরিতা: {urgencyOptions.find((option) => option.id === item.urgency)?.label || "সাধারণ"} · অবস্থা: {BLOOD_REQUEST_STATUS_LABELS[item.status] || statusText[item.status]}</Text><Text className="text-[13px] text-muted mt-2">{item.details ? `${item.details} · ` : ""}যোগাযোগের তথ্য গোপন; যাচাইয়ের পর অনুমোদিত রক্তসেবা সমন্বয়কারী ব্যবস্থা নেবেন। রক্ত সঞ্চালনের উপযোগিতা চিকিৎসক/হাসপাতাল নিশ্চিত করবেন।</Text>{canRespond || canManageConsent ? response ? <View className="mt-3"><Text className="text-sm font-bold text-green-800">আপনার উত্তর: {({ can_donate: "সাড়া দিতে পারব", unavailable: "এখন পারব না", need_information: "আরও তথ্য চাই" } as Record<string, string>)[response] || "উত্তর পাঠানো হয়েছে"}</Text>{response === "can_donate" ? <TouchableOpacity className="self-start rounded-full bg-white border border-red-200 px-3 py-2 mt-2" onPress={() => manageContactSharing(item.id)}><Text className="text-xs font-semibold text-red-700">নম্বর শেয়ার / সম্মতি পরিবর্তন</Text></TouchableOpacity> : null}</View> : <View className="mt-3"><Text className="text-xs font-bold text-foreground">আপনার উত্তর জানান:</Text><View className="flex-row flex-wrap gap-2 mt-2">{([ ["can_donate", "সাড়া দিতে পারব"], ["unavailable", "এখন পারব না"], ["need_information", "আরও তথ্য চাই"] ] as [DonorResponse, string][]).map(([value, label]) => <TouchableOpacity key={value} className="rounded-full bg-white border border-red-200 px-3 py-2" onPress={() => void respond(item.id, value)}><Text className="text-xs font-semibold text-red-700">{label}</Text></TouchableOpacity>)}</View></View> : null}</View>; }} />}
    <Modal visible={modal !== null} animationType="slide" onRequestClose={() => setModal(null)}><KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}><View className="flex-1 bg-background p-5"><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} contentContainerStyle={{ paddingBottom: 180 }}><View className="flex-row items-center justify-between mb-5"><Text className="text-xl font-bold text-foreground">{modal === "donor" ? "ডোনার পছন্দ" : "রক্তের অনুরোধ"}</Text><TouchableOpacity onPress={() => setModal(null)}><Ionicons name="close" size={24} color="#64748B" /></TouchableOpacity></View>
      <Text className="text-xs leading-5 text-muted mb-3">{modal === "donor" ? "কোন notification পাবেন এবং কোথায় সাড়া দিতে পারবেন—আপনি নিয়ন্ত্রণ করবেন। ফোন নম্বর public তালিকায় দেখানো হবে না।" : "শুধু প্রয়োজনীয় তথ্য দিন। যোগাযোগের নম্বর private রক্তসেবা queue-তে যাবে; শুধু অনুমোদিত সমন্বয়কারীরা দেখতে পারবেন।"}</Text>
      {modal === "donor" && legacyDonorNeedsRepublish ? <Text className="text-xs leading-5 text-red-700 mb-3">আপনার পুরোনো ডোনার তথ্য ব্যক্তিগতভাবে পাওয়া গেছে। তথ্য যাচাই করে সংরক্ষণ করলে ফোন নম্বর প্রকাশ না করেই আপনি আবার ডোনার তালিকায় যুক্ত হবেন।</Text> : null}
      <Text className="text-sm font-bold text-foreground mb-2">রক্তের গ্রুপ</Text><View className="flex-row flex-wrap gap-2 mb-4">{groups.slice(1).map((item) => <TouchableOpacity key={item} className={`rounded-full border px-4 py-2 ${((modal === "donor" ? donorForm.bloodGroup : requestForm.bloodGroup) === item) ? "bg-red-600 border-red-600" : "bg-surface border-border"}`} onPress={() => modal === "donor" ? setDonorForm((v) => ({ ...v, bloodGroup: item })) : setRequestForm((v) => ({ ...v, bloodGroup: item }))}><Text className={`text-xs font-bold ${((modal === "donor" ? donorForm.bloodGroup : requestForm.bloodGroup) === item) ? "text-white" : "text-muted"}`}>{item}</Text></TouchableOpacity>)}</View>
      {modal === "donor" ? <><TextInput className={inputClass} keyboardType="phone-pad" placeholder="মোবাইল নম্বর (private)" placeholderTextColor="#94A3B8" maxLength={11} value={donorForm.phone} onChangeText={(phone) => setDonorForm((v) => ({ ...v, phone }))} /><TextInput className={`${inputClass} mt-3`} placeholder="শেষ রক্তদানের তারিখ (ঐচ্ছিক)" placeholderTextColor="#94A3B8" maxLength={32} value={donorForm.lastDate} onChangeText={(lastDate) => setDonorForm((v) => ({ ...v, lastDate }))} /><TextInput className={`${inputClass} mt-3`} placeholder="যে ইউনিয়ন/এলাকায় সাড়া দিতে পারবেন" placeholderTextColor="#94A3B8" maxLength={160} value={donorForm.serviceArea} onChangeText={(serviceArea) => setDonorForm((v) => ({ ...v, serviceArea }))} /><CheckRow label="আমি রক্তের অনুরোধের notification পেতে সম্মতি দিচ্ছি" value={donorForm.receive} onPress={() => setDonorForm((v) => ({ ...v, receive: !v.receive }))} /><CheckRow label="আমি আপাতত অনুপলব্ধ—আমাকে request পাঠাবেন না" value={donorForm.unavailable} onPress={() => setDonorForm((v) => ({ ...v, unavailable: !v.unavailable }))} /><TouchableOpacity className="rounded-2xl bg-red-600 py-4 items-center mt-5" onPress={() => void saveDonor()} disabled={saving}>{saving ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">আমার পছন্দ সংরক্ষণ করুন</Text>}</TouchableOpacity></> : <><TextInput className={inputClass} placeholder="রোগীর নাম (ঐচ্ছিক)" placeholderTextColor="#94A3B8" maxLength={160} value={requestForm.patientName} onChangeText={(patientName) => setRequestForm((v) => ({ ...v, patientName }))} /><TextInput className={`${inputClass} mt-3`} placeholder="হাসপাতাল/ক্লিনিক *" placeholderTextColor="#94A3B8" maxLength={200} value={requestForm.hospital} onChangeText={(hospital) => setRequestForm((v) => ({ ...v, hospital }))} /><TextInput className={`${inputClass} mt-3`} placeholder="এলাকা বা হাসপাতালের ঠিকানা *" placeholderTextColor="#94A3B8" value={requestForm.area} onChangeText={(area) => setRequestForm((v) => ({ ...v, area }))} /><View className="mt-3 flex-row gap-2"><TextInput className={`flex-1 ${inputClass}`} keyboardType="number-pad" placeholder="কত bag?" placeholderTextColor="#94A3B8" value={requestForm.units} onChangeText={(units) => setRequestForm((v) => ({ ...v, units }))} /><TextInput className={`flex-1 ${inputClass}`} placeholder="কখন প্রয়োজন? *" placeholderTextColor="#94A3B8" value={requestForm.neededAt} onChangeText={(neededAt) => setRequestForm((v) => ({ ...v, neededAt }))} /></View><Text className="text-sm font-bold text-foreground mt-4 mb-2">জরুরিতার মাত্রা</Text><View className="flex-row gap-2">{urgencyOptions.map((option) => <TouchableOpacity key={option.id} onPress={() => setRequestForm((v) => ({ ...v, urgency: option.id }))} className={`flex-1 rounded-xl border py-2.5 ${requestForm.urgency === option.id ? "bg-red-50" : "bg-surface border-border"}`} style={requestForm.urgency === option.id ? { borderColor: option.color } : undefined}><Text className="text-center text-[12px] font-bold" style={{ color: requestForm.urgency === option.id ? option.color : "#64748B" }}>{option.label}</Text></TouchableOpacity>)}</View><TextInput className={`${inputClass} mt-3 min-h-20`} multiline textAlignVertical="top" placeholder="অতিরিক্ত বিবরণ (ঐচ্ছিক)" placeholderTextColor="#94A3B8" maxLength={2000} value={requestForm.details} onChangeText={(details) => setRequestForm((v) => ({ ...v, details }))} /><TextInput className={`${inputClass} mt-3`} keyboardType="phone-pad" placeholder="যোগাযোগ নম্বর * (শুধু requester ও অনুমোদিত coordinator দেখবেন)" placeholderTextColor="#94A3B8" maxLength={11} value={requestForm.contact} onChangeText={(contact) => setRequestForm((v) => ({ ...v, contact }))} /><TouchableOpacity className="rounded-2xl bg-red-600 py-4 items-center mt-5" onPress={() => void sendRequest()} disabled={saving}>{saving ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">প্রশাসকের কাছে জমা দিন</Text>}</TouchableOpacity></>}
      {error ? <Text className="text-sm text-red-600 mt-3">{error}</Text> : null}</ScrollView></View></KeyboardAvoidingView></Modal>
  </ScreenContainer>;
}
