from django.shortcuts import render, get_object_or_404
from .models import Post, Category
from comments.forms import CommentForm
from django.http import HttpResponse
from markdown import markdown
from markdown_newtab import NewTabExtension


# from django.views.decorators.cache import cache_page


# @cache_page(60*30)
def category(request, pk):
    cate = get_object_or_404(Category, pk=pk)
    post_list = Post.published.filter(category=cate).order_by('-pk')
    return render(request, 'blog/index.html', context={'post_list': post_list})


# @cache_page(60*30)
def index(request, page=1):
    page = int(page)
    final_page = int((Post.published.count() - 1) / 10) + 1
    pages = range(1, final_page + 1)
    if page not in pages:
        return my_404_not_found(request)
    post_list = Post.published.all().order_by('-pk')[(10 * page - 10): (10 * page)]
    next_page = page + 1

    return render(request, 'blog/index.html', context={'post_list': post_list,
                                                       'page': page,
                                                       'pages': pages,
                                                       'final_page': final_page,
                                                       'next_page': next_page})


# @cache_page(60*30)
def detail(request, pk):
    post = get_object_or_404(Post, pk=pk)
    if post.status == 'draft':
        return my_404_not_found(request)
    post.body = markdown(post.body, ['pymdownx.superfences', 'pymdownx.betterem',
                                     NewTabExtension(), 'downheader(levels=2)',
                                     'pymdownx.tilde', 'pymdownx.inlinehilite',
                                     'pymdownx.details'])
    form = CommentForm()

    music = post.get_music()

    # 获取这篇 post 下的全部评论
    comment_list = post.comment_set.all()
    comment_list_md = []
    for comment in comment_list:
        comment.text = markdown(comment.text)
        comment_list_md.append(comment)
    # 将文章、表单、以及文章下的评论列表作为模板变量传给 detail.html 模板，以便渲染相应数据。
    context = {'post': post,
               'form': form,
               'comment_list': comment_list_md,
               'music': music
               }
    return render(request, 'blog/detail.html', context=context)


# @cache_page(60*60)
def my_404_not_found(request):
    return HttpResponse(content=render(request, '404.html'), status=404)


# @cache_page(60*60)
def my_403_forbidden(request):
    return HttpResponse(content=render(request, '403.html'), status=403)
