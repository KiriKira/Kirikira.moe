from django.conf.urls import url
from . import views
from .rss import AllPostsRssFeed
from django.contrib.sitemaps.views import sitemap
from blog.sitemaps import PostSitemap

sitemaps = {
    'posts': PostSitemap,
}

urlpatterns = [
    url(r'^$', views.index, name='index'),
    url(r'^page/(?P<page>[0-9]+)/$', views.index, name='index_page'),
    url(r'^post/(?P<pk>[0-9]+)/$', views.detail, name='detail'),
    url(r'^category/(?P<pk>[0-9]+)/$', views.category, name='category'),
    url(r'^rss/$', AllPostsRssFeed(), name='rss'),
    url(r'^sitemap\.xml$', sitemap, {'sitemaps': sitemaps},
        name='django.contrib.sitemaps.views.sitemap'),
]
