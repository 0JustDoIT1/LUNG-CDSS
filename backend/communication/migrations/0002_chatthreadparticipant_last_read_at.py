from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("communication", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatthreadparticipant",
            name="last_read_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
