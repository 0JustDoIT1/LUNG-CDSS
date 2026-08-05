from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("intake", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="intakeform",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
