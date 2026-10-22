from django.conf.urls import include, url
from django.contrib import admin
from blog import views
from django.contrib.sitemaps.views import sitemap
from blog.sitemaps import PostSitemap

sitemaps = {
        'posts': PostSitemap,
        }

urlpatterns = [
    # Examples:
    # url(r'^$', 'kirikira.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^admine/', include(admin.site.urls)),
    url(r'', include('blog.urls', namespace='blog')),
    url(r'', include('comments.urls', namespace='comments')),
    url(r'^sitemap\.xml$', sitemap, {'sitemaps': sitemaps},
        name='django.contrib.sitemaps.views.sitemap'),
]

handler404 = views.my_404_not_found
handler403 = views.my_403_forbidden
