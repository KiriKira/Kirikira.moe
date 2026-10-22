{% load staticfiles %}
var CACHE_NAME = 'my-site-cache-v1';
var urlsToCache = [
  //'//kira-static-yelook-com.alikunlun.com/static/',
  //'//cf.kirikira.moe/',
  //'//static.kirikira.moe/',
  './static/'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll([
        '/',
        '{% static 'img/kiri.mp4' %}',
        '{% static 'css/elements.css' %}',
        '{% static 'css/header.css' %}',
        '{% static 'css/mythemes-icons.css' %}',
        '{% static 'css/materialize.min.css' %}',
        '{% static 'css/typography.css' %}',
        '{% static 'css/nav.css' %}',
        '{% static 'css/blog.css' %}',
        '{% static 'css/footer.css' %}',
        '{% static 'css/widgets.css' %}',
        '{% static 'css/csshake.css' %}',
        '{% static 'css/style.css' %}',
        '{% static 'js/jquery-migrate.min.js' %}',
        '{% static 'js/jquery.js' %}',
        '{% static 'js/masonry.min.js' %}',
        '{% static 'js/functions.js' %}',
        '{% static 'js/materialize.min.js' %}',
        '{% static 'img/banner.jpg' %}'
      ]);
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Cache hit - return response
        if (response) {
          return response;
        }
      }
    )
  );
});

  self.addEventListener('activate', function(event) {
    var cacheWhitelist = []
    event.waitUntil(
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(cacheName) {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    );
  });