from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0005_passwordresettoken"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="assigned_area",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Assigned city corporation or geographical jurisdiction (e.g. 'dhaka', 'chattogram', etc.).",
                max_length=64,
            ),
        ),
    ]
