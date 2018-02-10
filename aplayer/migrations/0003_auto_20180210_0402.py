# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aplayer', '0002_auto_20180209_1552'),
    ]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='post',
            field=models.OneToOneField(to='blog.Post', blank=True, null=True),
        ),
    ]
