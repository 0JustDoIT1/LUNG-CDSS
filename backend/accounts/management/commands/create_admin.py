"""
python manage.py create_admin --email admin@lung-cdss.com --name 관리자 --password ****

기본 createsuperuser는 USERNAME_FIELD(=id, UUID)를 물어보는 이상한 UX가
되어버려서 못 씀. 이 명령어가 그 대체.
"""

import getpass

from django.core.management.base import BaseCommand, CommandError

from accounts.models import StaffAuth, User


class Command(BaseCommand):
    help = "Django Admin(/admin/) 로그인용 관리자 계정을 생성합니다."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", default="관리자")
        parser.add_argument("--password", default=None, help="생략하면 대화형으로 입력받음")

    def handle(self, *args, **options):
        email = options["email"]
        name = options["name"]
        password = options["password"]

        if StaffAuth.objects.filter(email=email).exists():
            raise CommandError(f"이미 등록된 이메일입니다: {email}")

        if not password:
            password = getpass.getpass("비밀번호: ")
            confirm = getpass.getpass("비밀번호 확인: ")
            if password != confirm:
                raise CommandError("비밀번호가 일치하지 않습니다.")

        user = User.objects.create_staff(role=User.Role.DOCTOR, name=name, password=password)
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_staff", "is_superuser"])

        staff_auth = StaffAuth(user=user, email=email)
        staff_auth.set_password(password)
        staff_auth.save()

        self.stdout.write(self.style.SUCCESS(f"관리자 계정 생성 완료: {email} (user_id={user.id})"))
        self.stdout.write("이제 /admin/ 에서 이 이메일+비밀번호로 로그인 가능합니다.")
