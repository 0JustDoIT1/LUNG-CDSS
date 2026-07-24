from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import SignupSerializer


@api_view(["POST"])
def signup(request):
    serializer = SignupSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response({"hospital_code": user.username}, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def login(request):
    hospital_code = request.data.get("hospital_code")
    password = request.data.get("password")

    if not hospital_code or not password:
        return Response({"error": "hospital_code와 password는 필수입니다"}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(username=hospital_code, password=password)
    if user is None:
        return Response({"error": "병원코드 또는 비밀번호가 올바르지 않습니다"}, status=status.HTTP_401_UNAUTHORIZED)

    profile = getattr(user, "hospital_profile", None)
    if profile is None:
        return Response({"error": "프로필 정보가 없습니다"}, status=status.HTTP_401_UNAUTHORIZED)

    refresh = RefreshToken.for_user(user)

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "name": profile.name,
        "department": profile.department,
        "role": profile.role,
    })