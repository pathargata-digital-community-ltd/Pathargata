import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  isSinglePostVideo,
  normalizePostImages,
  parsePostMediaContent,
} from "@/lib/post-media";
import { getFeedImageUri } from "@/lib/media-delivery";
import { useDataSaver } from "@/lib/data-saver";

type PostRichMediaProps = {
  images?: unknown;
  image?: unknown;
  mediaType?: string;
  type?: string;
  audio?: string;
  videoUrl?: string;
  youtubeUrl?: string;
  youtubeTitle?: string;
  content?: string;
  onDoubleTapLike: () => void;
  playbackEnabled?: boolean;
};

export function PostRichMedia({
  images: rawImages,
  image,
  mediaType,
  type,
  audio,
  videoUrl,
  youtubeUrl,
  youtubeTitle,
  content,
  onDoubleTapLike,
  playbackEnabled = true,
}: PostRichMediaProps) {
  const dataSaver = useDataSaver();
  const effectivePlaybackEnabled = playbackEnabled && !dataSaver;
  const images = normalizePostImages(rawImages, image);
  const parsedContent = parsePostMediaContent(content);
  const videoUri =
    (images.length === 1 && isSinglePostVideo(images[0], mediaType, 1)
      ? images[0]
      : undefined) ||
    (typeof videoUrl === "string" && videoUrl.trim() ? videoUrl : undefined);
  const galleryImages = videoUri ? [] : images;
  const audioUri =
    typeof audio === "string" && audio.trim() ? audio : undefined;
  const hasMedia = Boolean(
    galleryImages.length ||
    videoUri ||
    audioUri ||
    type === "voice" ||
    youtubeUrl ||
    parsedContent.youtubeId ||
    parsedContent.driveId,
  );

  if (!hasMedia) return null;

  return (
    <View className="px-4 pb-4 gap-3">
      {audioUri && effectivePlaybackEnabled ? <PostAudioPlayer uri={audioUri} /> : null}
      {videoUri && effectivePlaybackEnabled ? <PostVideoPlayer key={videoUri} uri={videoUri} /> : null}
      {audioUri && !effectivePlaybackEnabled ? (
        <Text className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
          অডিও শুনতে পোস্টের বিস্তারিত খুলুন
        </Text>
      ) : null}
      {galleryImages.length > 0 ? (
        <PostImageGallery
          images={galleryImages}
          onDoubleTapLike={onDoubleTapLike}
          variant="detail"
        />
      ) : null}
      {(youtubeUrl || parsedContent.youtubeId) ? (
        <YoutubeThumbnailCard
          id={youtubeUrl ? parsePostMediaContent(youtubeUrl).youtubeId : parsedContent.youtubeId}
          title={youtubeTitle}
          portrait={youtubeUrl ? parsePostMediaContent(youtubeUrl).youtubeIsShort : parsedContent.youtubeIsShort}
        />
      ) : null}
      {parsedContent.driveId && effectivePlaybackEnabled ? (
        <EmbeddedPostMedia kind="drive" id={parsedContent.driveId} />
      ) : null}
      {type === "voice" && !audioUri ? (
        <Text className="text-xs text-muted">
          {effectivePlaybackEnabled
            ? "এই voice post-এ অডিও ফাইল পাওয়া যায়নি।"
            : "ভয়েস পোস্ট শুনতে বিস্তারিত খুলুন।"}
        </Text>
      ) : null}
    </View>
  );
}

export function PostYoutubeCard({ content, title, previewOnly = false }: { content?: string; title?: string; previewOnly?: boolean }) {
  const parsed = parsePostMediaContent(content);
  if (!parsed.youtubeId) return null;
  return <YoutubeThumbnailCard id={parsed.youtubeId} title={title} portrait={parsed.youtubeIsShort} previewOnly={previewOnly} />;
}

function YoutubeThumbnailCard({ id, title, portrait = false, previewOnly = false }: { id?: string; title?: string; portrait?: boolean; previewOnly?: boolean }) {
  const [activated, setActivated] = useState(false);
  const dataSaver = useDataSaver();
  const { height: windowHeight } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  useEffect(() => {
    if (!activated || Platform.OS === "web") return;
    const timer = setInterval(() => {
      cardRef.current?.measureInWindow((_x, y, _width, cardHeight) => {
        if (y + cardHeight < 0 || y > windowHeight) setActivated(false);
      });
    }, 350);
    return () => clearInterval(timer);
  }, [activated, windowHeight]);
  if (!id) return null;
  const thumbnail = `https://i.ytimg.com/vi/${id}/${dataSaver ? "mqdefault" : "hqdefault"}.jpg`;
  if (activated) {
    return <View ref={cardRef}><EmbeddedPostMedia kind="youtube" id={id} portrait={portrait} /></View>;
  }
  return (
    <View ref={cardRef} className="overflow-hidden rounded-2xl border border-[#D8E5DC] bg-[#101916]">
      {title ? <Text className="bg-[#F2F8F3] px-3.5 pb-2.5 pt-3 text-[15px] font-extrabold leading-5 text-[#173C2D]">{title}</Text> : null}
      <TouchableOpacity onPress={previewOnly ? undefined : () => setActivated(true)} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={previewOnly ? "YouTube ভিডিও preview" : "YouTube ভিডিও চালু করুন"}>
      <View style={{ aspectRatio: portrait ? 0.72 : 1.78 }}>
        <ExpoImage
          source={{ uri: thumbnail }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={180}
          style={{ width: "100%", height: "100%" }}
          accessibilityLabel="YouTube ভিডিও thumbnail"
        />
        <View className="absolute inset-0 items-center justify-center bg-black/25">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#FF0033] shadow-lg">
            <Ionicons name="play" size={27} color="white" />
          </View>
        </View>
        <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-2 bg-black/65 px-3 py-2.5">
          <Ionicons name="logo-youtube" size={18} color="#FF3358" />
          <Text className="flex-1 text-[12px] font-bold text-white">পাথরঘাটা ডিজিটাল ভিডিও · {previewOnly ? "preview" : "চালু করতে চাপ দিন"}</Text>
        </View>
      </View>
      </TouchableOpacity>
    </View>
  );
}

export function PostImageGallery({
  images,
  onDoubleTapLike,
  variant = "detail",
}: {
  images: string[];
  onDoubleTapLike: () => void;
  variant?: "detail" | "feed";
}) {
  const { width, height } = useWindowDimensions();
  const dataSaver = useDataSaver();
  const isFeed = variant === "feed";
  const imagesSignature = JSON.stringify(images);
  const stableImages = useMemo(
    () => JSON.parse(imagesSignature) as string[],
    [imagesSignature],
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [heartVisible, setHeartVisible] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [imageRetries, setImageRetries] = useState<Record<string, number>>({});
  const imageTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const nextRatios: Record<string, number> = {};
    // Feed cards render at most four thumbnails. Avoid issuing size requests for
    // images that are only reachable after opening the full-screen viewer.
    const imagesToMeasure = isFeed ? stableImages.slice(0, 4) : stableImages;
    let remaining = imagesToMeasure.length;
    if (!remaining) return () => { active = false; };
    imagesToMeasure.forEach((uri) => {
      Image.getSize(
        isFeed ? getFeedImageUri(uri, dataSaver) : uri,
        (imageWidth, imageHeight) => {
          if (!active) return;
          if (imageWidth > 0 && imageHeight > 0) nextRatios[uri] = imageWidth / imageHeight;
          remaining -= 1;
          if (remaining === 0) setImageRatios(nextRatios);
        },
        () => {
          remaining -= 1;
          if (active && remaining === 0) setImageRatios(nextRatios);
        },
      );
    });
    return () => { active = false; };
  }, [dataSaver, isFeed, stableImages]);

  useEffect(
    () => () => {
      if (imageTapTimer.current) clearTimeout(imageTapTimer.current);
      if (heartTimer.current) clearTimeout(heartTimer.current);
    },
    [],
  );

  function showLikeFeedback() {
    onDoubleTapLike();
    setHeartVisible(true);
    if (heartTimer.current) clearTimeout(heartTimer.current);
    heartTimer.current = setTimeout(() => {
      setHeartVisible(false);
      heartTimer.current = null;
    }, 650);
  }

  function handleImagePress(index: number) {
    if (imageTapTimer.current) {
      clearTimeout(imageTapTimer.current);
      imageTapTimer.current = null;
      showLikeFeedback();
      return;
    }
    imageTapTimer.current = setTimeout(() => {
      imageTapTimer.current = null;
      setViewerIndex(index);
    }, 280);
  }

  function retryImage(uri: string) {
    setFailedImages((current) => ({ ...current, [uri]: false }));
    setLoadedImages((current) => ({ ...current, [uri]: false }));
    setImageRetries((current) => ({ ...current, [uri]: (current[uri] || 0) + 1 }));
  }

  function renderImage(uri: string, resizeMode: "contain" | "cover") {
    const failed = Boolean(failedImages[uri]);
    const loaded = Boolean(loadedImages[uri]);
    const displayUri = isFeed ? getFeedImageUri(uri, dataSaver) : uri;
    return (
      <View className="h-full w-full bg-[#111827]">
        {!loaded && !failed ? <View className="absolute inset-0 bg-[#E7F0EA] px-6 py-5"><View className="h-3 w-2/5 rounded-full bg-[#D4E3D8]" /><View className="mt-3 h-3 w-4/5 rounded-full bg-[#D4E3D8]" /><View className="mt-3 h-3 w-3/5 rounded-full bg-[#D4E3D8]" /><View className="absolute inset-0 items-center justify-center"><ActivityIndicator color="#5B8B70" /></View></View> : null}
        <ExpoImage
          key={`${uri}:${imageRetries[uri] || 0}`}
          source={{ uri: displayUri }}
          style={{ width: "100%", height: "100%", opacity: loaded ? 1 : 0 }}
          contentFit={resizeMode}
          cachePolicy="memory-disk"
          transition={150}
          onLoadStart={() => setLoadedImages((current) => current[uri] === false ? current : { ...current, [uri]: false })}
          onLoad={() => setLoadedImages((current) => current[uri] === true ? current : { ...current, [uri]: true })}
          onError={() => {
            setLoadedImages((current) => current[uri] === false ? current : { ...current, [uri]: false });
            setFailedImages((current) => current[uri] === true ? current : { ...current, [uri]: true });
          }}
          accessibilityLabel="পোস্টের ছবি"
        />
        {failed ? <View className="absolute inset-0 items-center justify-center bg-[#17251F]/90 px-5"><Ionicons name="image-outline" size={28} color="#D1FAE5" /><Text className="mt-2 text-center text-xs font-semibold text-white">ছবি লোড হয়নি</Text><Text className="mt-1 text-center text-[11px] text-green-100">আবার চেষ্টা করতে ছবিতে চাপ দিন</Text></View> : null}
      </View>
    );
  }

  const measuredWidth = galleryWidth || Math.max(280, width - (isFeed ? 32 : 32));
  function ratioFor(uri: string) {
    return imageRatios[uri] || 1;
  }
  function naturalHeight(uri: string, contentWidth: number) {
    return Math.max(140, Math.round(contentWidth / ratioFor(uri)));
  }
  function gridHeight(uri: string, contentWidth: number) {
    // Preserve portrait height while preventing an unmeasured image from collapsing the grid.
    return Math.max(150, Math.min(naturalHeight(uri, contentWidth), 720));
  }
  const gap = 2;
  const halfWidth = Math.max(1, (measuredWidth - gap) / 2);

  function renderTile(uri: string, index: number, tileWidth: number, tileHeight: number) {
    const remaining = images.length - 4;
    return (
      <TouchableOpacity
        key={`${index}:${uri}`}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`ছবি ${index + 1} দেখুন`}
        onPress={() => failedImages[uri] ? retryImage(uri) : handleImagePress(index)}
        style={{ width: tileWidth, height: tileHeight, backgroundColor: "#111827" }}
      >
        {renderImage(uri, isFeed ? "cover" : "contain")}
        {images.length > 4 && index === 3 ? (
          <View className="absolute inset-0 items-center justify-center bg-black/55">
            <Text className="text-3xl font-bold text-white">+{remaining}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  function renderGrid() {
    if (images.length === 2) {
      return (
        <View className="flex-row" style={{ gap }}>
          {images.map((uri, index) => renderTile(uri, index, halfWidth, gridHeight(uri, halfWidth)))}
        </View>
      );
    }
    if (images.length === 3) {
      const topHeight = gridHeight(images[0], measuredWidth);
      const bottomHeight = Math.max(
        gridHeight(images[1], halfWidth),
        gridHeight(images[2], halfWidth),
      );
      return (
        <View style={{ gap }}>
          {renderTile(images[0], 0, measuredWidth, topHeight)}
          <View className="flex-row" style={{ gap }}>
            {renderTile(images[1], 1, halfWidth, bottomHeight)}
            {renderTile(images[2], 2, halfWidth, bottomHeight)}
          </View>
        </View>
      );
    }
    return (
      <View className="flex-row flex-wrap" style={{ gap }}>
        {images.slice(0, 4).map((uri, index) => renderTile(uri, index, halfWidth, gridHeight(uri, halfWidth)))}
      </View>
    );
  }

  function feedFrameHeight(uri: string) {
    const ratio = ratioFor(uri);
    const frameRatio = ratio < 0.62 ? 1.22 : ratio < 0.9 ? 1.04 : 0.82;
    return Math.max(220, Math.min(480, Math.round(measuredWidth * frameRatio)));
  }

  return (
    <View
      className="overflow-hidden rounded-2xl bg-black"
      onLayout={(event) => setGalleryWidth(event.nativeEvent.layout.width)}
    >
      {images.length === 1 ? (
        <TouchableOpacity
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="ছবি বড় করে দেখুন; double tap করলে like হবে"
          onPress={() => failedImages[images[0]] ? retryImage(images[0]) : handleImagePress(0)}
          style={{
            height: isFeed ? feedFrameHeight(images[0]) : naturalHeight(images[0], measuredWidth),
            width: "100%",
            backgroundColor: "#111827",
          }}
        >
          {renderImage(images[0], isFeed ? "cover" : "contain")}
        </TouchableOpacity>
      ) : renderGrid()}

      {heartVisible ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <Ionicons name="heart" size={72} color="white" />
        </View>
      ) : null}

      <Modal
        visible={viewerIndex !== null}
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View className="flex-1 bg-black">
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          {viewerIndex !== null ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              initialScrollIndex={viewerIndex}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              keyExtractor={(item, index) => `${index}:${item}`}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                setViewerIndex(Math.max(0, Math.min(index, images.length - 1)));
              }}
              renderItem={({ item }) => (
                <View style={{ width, height }} className="items-center justify-center">
                  <ExpoImage
                    source={{ uri: item }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={0}
                    style={{ width, height }}
                    accessibilityLabel="সম্পূর্ণ পোস্ট ছবি"
                  />
                </View>
              )}
              showsHorizontalScrollIndicator={false}
            />
          ) : null}
          <View className="absolute left-0 right-0 flex-row items-center justify-between px-5" style={{ top: Platform.OS === "ios" ? 54 : 36 }}>
            <Text className="rounded-full bg-black/60 px-3 py-2 text-sm font-semibold text-white">
              {viewerIndex === null ? "" : `${viewerIndex + 1} / ${images.length}`}
            </Text>
            <TouchableOpacity onPress={() => setViewerIndex(null)} accessibilityRole="button" accessibilityLabel="ছবি viewer বন্ধ করুন" className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function PostVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  return (
    <View className="overflow-hidden rounded-2xl bg-black">
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        style={{ width: "100%", height: 280, backgroundColor: "#000000" }}
      />
    </View>
  );
}

export function PostAudioPlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-slate-900 p-3">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-rose-600">
        <Ionicons name="mic" size={21} color="white" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-white">ভয়েস পোস্ট</Text>
        <Text className="mt-1 text-xs text-slate-300">
          {status.playing ? "চলছে..." : "শুনতে চাপ দিন"}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => (status.playing ? player.pause() : player.play())}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "অডিও pause করুন" : "অডিও চালান"}
        className="h-10 w-10 items-center justify-center rounded-full bg-white"
      >
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={18}
          color="#15803D"
        />
      </TouchableOpacity>
    </View>
  );
}

function EmbeddedPostMedia({
  kind,
  id,
  portrait = false,
}: {
  kind: "youtube" | "drive";
  id: string;
  portrait?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const youtubeEmbedOrigin = "https://pathargata-digital-comnity-ltd.web.app";
  const url =
    kind === "youtube"
      ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0&origin=${encodeURIComponent(youtubeEmbedOrigin)}`
      : `https://drive.google.com/file/d/${id}/preview`;
  const externalUrl = kind === "youtube"
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
    : url;
  const height = kind === "youtube" && portrait ? 420 : 250;

  if (failed) {
    return (
      <TouchableOpacity
        onPress={() => void Linking.openURL(externalUrl).catch(() => undefined)}
        accessibilityRole="link"
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4"
      >
        <Ionicons
          name={kind === "youtube" ? "logo-youtube" : "open-outline"}
          size={24}
          color="#15803D"
        />
        <Text className="flex-1 text-sm font-semibold text-primary">
          Embed লোড হয়নি—বাইরে খুলুন
        </Text>
        <Ionicons name="chevron-forward" size={19} color="#64748B" />
      </TouchableOpacity>
    );
  }

  return (
    <View
      className="overflow-hidden rounded-2xl border border-border bg-black"
      style={{ height }}
    >
      <WebView
        source={{
          uri: url,
          ...(kind === "youtube" ? { headers: { Referer: `${youtubeEmbedOrigin}/` } } : {}),
        }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        scrollEnabled={false}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        style={{ flex: 1, backgroundColor: "#000000" }}
      />
      {loading && Platform.OS !== "web" ? (
        <View pointerEvents="none" className="absolute right-2 top-2">
          <ActivityIndicator color="white" />
        </View>
      ) : null}
    </View>
  );
}
