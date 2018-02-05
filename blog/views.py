from django.shortcuts import render, get_object_or_404
from .models import Post, Category
from comments.forms import CommentForm
import markdown2


def category(request, pk):
    cate = get_object_or_404(Category, pk=pk)
    post_list = Post.published.filter(category=cate).order_by('-created_time')
    return render(request, 'blog/index.html', context={'post_list': post_list})


def index(request, page=1):

    page = int(page)
    final_page = int(Post.published.count() / 10) + 1
    pages = range(1, final_page + 1)
    if page not in pages:
        return my_404_not_found(request)
    post_list = Post.published.all().order_by('-created_time')[(10 * page - 10): (10 * page - 1)]
    next_page = page + 1

    return render(request, 'blog/index.html', context={'post_list': post_list,
                                                       'page': page,
                                                       'pages': pages,
                                                       'final_page': final_page,
                                                       'next_page': next_page})


def detail(request, pk):
    post = get_object_or_404(Post, pk=pk)
    if post.status == 'draft':
        return my_404_not_found(request)
    post.body = markdown2.markdown(post.body,
                                   extras=['fenced-code-blocks'])
    form = CommentForm()
    # 获取这篇 post 下的全部评论
    comment_list = post.comment_set.all()
    comment_list_md = []
    for comment in comment_list:
        comment.text = markdown2.markdown(comment.text,
                                          extras=['fenced-code-blocks'])
        comment_list_md.append(comment)
    # 将文章、表单、以及文章下的评论列表作为模板变量传给 detail.html 模板，以便渲染相应数据。
    context = {'post': post,
               'form': form,
               'comment_list': comment_list_md
               }
    return render(request, 'blog/detail.html', context=context)


def my_404_not_found(request):
    return render(request, '404.html')


def my_403_forbidden(request):
    return render(request, '403.html')
