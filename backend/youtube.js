// YouTube Data API v3 helpers, shared by GET /api/play/:id and fetch-media.js. search = 100 quota units, videos.list = 1.
const get = async (path, params) => {
  const data = await (await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY })}`)).json();
  if (data.error) throw new Error(`YouTube: ${data.error.message}`);
  return data;
};

export const findVideo = async (q) =>
  (await get("search", { part: "id", type: "video", videoEmbeddable: "true", maxResults: "1", q })).items?.[0]?.id?.videoId;

// up to 50 ids per call -> { id: viewCount }
export const viewCounts = async (ids) =>
  Object.fromEntries((await get("videos", { part: "statistics", id: ids.join(",") })).items.map((v) => [v.id, Number(v.statistics.viewCount)]));
