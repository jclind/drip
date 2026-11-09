// @ts-check
// Made-up videos for the store images, so no real channel or thumbnail shows up in them. dev/home.html uses these in
// place of its own list with ?videos=store. Titles and channels come from the welcome tour (welcome.js), plus a few more
// for the stash. Only the revealed card shows a picture, so only the first video needs a thumbnail in thumbs/.

(() => {
  if (new URLSearchParams(location.search).get('videos') !== 'store') return;

  /** @type {{id: string, title: string, channel: string, length: string, views?: string, age?: string}[]} */
  const videos = [
    { id: 'store-trail', title: 'Riding the ridge trail before the storm', channel: 'Trail Days', length: '21:35', views: '1.2M views', age: '1w ago' },
    { id: 'store-joinery', title: 'How Japanese joinery holds without nails', channel: 'Workshop Notes', length: '14:02', views: '214K views', age: '3d ago' },
    { id: 'store-bread', title: 'Sourdough with a schedule that fits a workday', channel: 'Kitchen Basics', length: '9:08', views: '48K views', age: '2mo ago' },
    { id: 'store-orbit', title: 'Why the Moon always shows the same face', channel: 'Slow Science', length: '12:47', views: '3.4M views', age: '5d ago' },
    { id: 'store-redstone', title: 'Building a working clock out of redstone', channel: 'Blockworks', length: '25:33', views: '612K views', age: '1y ago' },
    { id: 'store-bike', title: 'Truing a bike wheel at home, start to finish', channel: 'Garage Hours', length: '18:20', views: '96K views', age: '4mo ago' },
    { id: 'store-tide', title: 'What a tide clock actually measures', channel: 'Slow Science', length: '7:44', views: '880K views', age: '2w ago' },
    { id: 'store-knife', title: 'Sharpening on a single whetstone', channel: 'Workshop Notes', length: '11:16', views: '402K views', age: '6mo ago' },
    { id: 'store-chess', title: 'One endgame idea that wins half your games', channel: 'Quiet Moves', length: '16:09', views: '1.9M views', age: '3w ago' },
  ];
  /** @type {any} */ (globalThis).DripStoreVideos = videos;

  // home.js asks i.ytimg.com for thumbnails. Send those to local files instead, so nothing loads from YouTube.
  const desc = /** @type {PropertyDescriptor} */ (Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'));
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    ...desc,
    set(/** @type {string} */ url) {
      const m = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\//.exec(url);
      desc.set?.call(this, m ? `/store/art/thumbs/${decodeURIComponent(m[1])}.svg` : url);
    },
  });
})();
