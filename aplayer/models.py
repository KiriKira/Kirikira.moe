from django.db import models


class Player(models.Model):
    """
    The app is made to use aPlayer(https://github.com/MoePlayer/APlayer) in the blog
    """

    # title and author for the music
    title = models.CharField(max_length=50)
    author = models.CharField(max_length=30)

    url = models.URLField()
    pic = models.URLField()

    post = models.OneToOneField('blog.Post', blank=True, null=True)

    def __str__(self):
        return self.title

# Create your models here.
