from django.db import models


class Comment(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField(max_length=255, blank=True)
    url = models.URLField(blank=True,
                          help_text="Must be started as http(s)://")
    text = models.TextField()
    created_time = models.DateTimeField(auto_now_add=True)

    post = models.ForeignKey('blog.Post')

    def __str__(self):
        return self.text[:20]
