# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aplayer', '0003_auto_20180210_0402'),
    ]

    operations = [
        migrations.AlterField(
            model_name='player',
            name='post',
            field=models.OneToOneField(to='blog.Post', null=True, blank=True, related_name='player'),
        ),
    ]
