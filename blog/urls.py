from django.conf.urls import url
from django.views.generic import TemplateView
from django.contrib.sitemaps.views import sitemap
from . import views
from .rss import AllPostsRssFeed
from blog.sitemaps import PostSitemap
from django.views.decorators.cache import cache_control


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
    url(r'^sw.js', cache_control(max_age=2592000)(TemplateView.as_view(
        template_name="sw/sw.js",
        content_type='application/javascript',
    )), name='service-worker.js'),
]
