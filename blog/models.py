from django.db import models
from django.contrib.auth.models import User
from django.core.urlresolvers import reverse
from django.core.exceptions import ObjectDoesNotExist


class Category(models.Model):

    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Tag(models.Model):

    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class PublishedManager(models.Manager):
    def get_queryset(self):
        return super(PublishedManager,
                    self).get_queryset().filter(status='published')


class Post(models.Model):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('published', 'Published'),
    )

    objects = models.Manager()
    published = PublishedManager()

    title = models.CharField(max_length=70)

    body = models.TextField()

    created_time = models.DateTimeField()
    modified_time = models.DateTimeField()

    excerpt = models.CharField(max_length=200, blank=True)
    tags = models.ManyToManyField(Tag, blank=True)

    category = models.ForeignKey(Category)

    author = models.ForeignKey(User)

    status = models.CharField(max_length=10,
                              choices=STATUS_CHOICES,
                              default='draft')

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse('blog:detail', kwargs={'pk': self.pk})

    def get_music(self):
        try:
            music = self.player
        except ObjectDoesNotExist:
            music = None
        return music

