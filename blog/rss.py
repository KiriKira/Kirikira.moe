from django.contrib.syndication.views import Feed

from .models import Post


class AllPostsRssFeed(Feed):

    title = "是Kiri的博客呢"

    link = "/"

    description = "是Kiri的rss呢"

    def items(self):
        return Post.objects.all()

    def item_title(self, item):
        return '[%s] %s' % (item.category, item.title)

    def item_description(self, item):
        return item.excerpt
