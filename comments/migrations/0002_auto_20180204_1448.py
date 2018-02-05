# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('comments', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='comment',
            name='email',
            field=models.EmailField(blank=True, max_length=255),
        ),
        migrations.AlterField(
            model_name='comment',
            name='url',
            field=models.URLField(blank=True, help_text='Must be started as http(s)://'),
        ),
    ]
