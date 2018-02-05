from django.conf.urls import url

from . import views
from .rss import AllPostsRssFeed

urlpatterns = [
    url(r'^$', views.index, name='index'),
    url(r'^page/(?P<page>[0-9]+)/$', views.index, name='index_page'),
    url(r'^post/(?P<pk>[0-9]+)/$', views.detail, name='detail'),
    url(r'^category/(?P<pk>[0-9]+)/$', views.category, name='category'),
    url(r'^rss/$', AllPostsRssFeed(), name='rss'),
]
