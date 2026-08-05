from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("medications", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="medicationlog",
            name="reminder_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
