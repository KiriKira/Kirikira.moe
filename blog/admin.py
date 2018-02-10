# -*- coding:utf-8 -*-
from django.contrib import admin
from .models import Post, Category, Tag
from comments.models import Comment
from aplayer.models import Player


class PostAdmin(admin.ModelAdmin):
    list_display = ['title', 'created_time', 'modified_time', 'category',
                    'author', 'status']

    list_filter = ('status', 'created_time', 'category', 'author')
    search_fields = ('title', 'body')
    ordering = ['status', 'created_time']

    fields = ('title', 'body', 'excerpt',
              'category', 'author', 'status',
              'player')


class CommentAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_time', 'email', 'post']


class PlayerAdmin(admin.ModelAdmin):
    list_display = ['title', 'author', 'url']


admin.site.register(Post, PostAdmin)
admin.site.register(Comment, CommentAdmin)
admin.site.register(Player, PlayerAdmin)
admin.site.register(Category)
admin.site.register(Tag)

# Register your models here.
