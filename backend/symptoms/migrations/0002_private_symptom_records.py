from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("symptoms", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="symptomcheck",
            name="memo",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.RemoveField(model_name="symptomcheck", name="nurse_reviewed_by"),
        migrations.RemoveField(model_name="symptomcheck", name="nurse_reviewed_at"),
        migrations.RemoveField(model_name="symptomcheck", name="nurse_reviewed"),
        migrations.RemoveField(model_name="symptomcheck", name="visible_to_nurse"),
    ]
