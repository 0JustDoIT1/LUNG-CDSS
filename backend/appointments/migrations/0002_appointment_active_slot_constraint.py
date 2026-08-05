from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.UniqueConstraint(
                fields=("doctor", "requested_at_slot"),
                condition=models.Q(status__in=["requested", "confirmed", "reminded_d7", "reminded_d1"]),
                name="uniq_active_doctor_slot",
            ),
        ),
    ]
