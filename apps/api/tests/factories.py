import uuid
from typing import Any

import factory
from factory import LazyFunction, Sequence
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.enums import NotificationType, ReportCategory, ReportStatus
from src.core.security import hash_password
from src.modules.auth.models import User
from src.modules.cases.models import Case
from src.modules.notifications.models import Notification
from src.modules.reports.models import Report


class UserFactory(factory.Factory):
    class Meta:
        model = User

    id = LazyFunction(uuid.uuid4)
    email = Sequence(lambda n: f"user_{n}_{uuid.uuid4().hex[:6]}@example.com")
    password_hash = LazyFunction(lambda: hash_password("testpassword123"))
    is_active = True
    is_admin = False

    @classmethod
    async def create_async(cls, db: AsyncSession, **kwargs: Any) -> User:
        if "hashed_password" in kwargs:
            kwargs["password_hash"] = kwargs.pop("hashed_password")
        user = cls.build(**kwargs)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


class ReportFactory(factory.Factory):
    class Meta:
        model = Report

    id = LazyFunction(uuid.uuid4)
    title = Sequence(lambda n: f"Report Issue #{n}")
    description = factory.Faker("sentence", nb_words=10)
    category = ReportCategory.road.value
    status = ReportStatus.submitted.value
    latitude = 37.7749
    longitude = -122.4194
    address = "123 Main Street"
    media_urls = LazyFunction(list)
    is_deleted = False
    flagged = False
    flag_reason = None
    user_id = None

    @classmethod
    async def create_async(cls, db: AsyncSession, **kwargs: Any) -> Report:
        if "user" in kwargs:
            user = kwargs.pop("user")
            kwargs["user_id"] = user.id
        elif "user_id" not in kwargs or kwargs["user_id"] is None:
            user = await UserFactory.create_async(db)
            kwargs["user_id"] = user.id

        report = cls.build(**kwargs)
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return report


class CaseFactory(factory.Factory):
    class Meta:
        model = Case

    id = LazyFunction(uuid.uuid4)
    title = Sequence(lambda n: f"Case Title #{n}")
    description = factory.Faker("sentence", nb_words=10)
    status = "opened"
    report_id = None
    assigned_to_id = None

    @classmethod
    async def create_async(cls, db: AsyncSession, **kwargs: Any) -> Case:
        if "report" in kwargs:
            report = kwargs.pop("report")
            kwargs["report_id"] = report.id
            if "title" not in kwargs:
                kwargs["title"] = report.title
            if "description" not in kwargs:
                kwargs["description"] = report.description
        elif "report_id" not in kwargs or kwargs["report_id"] is None:
            report = await ReportFactory.create_async(db)
            kwargs["report_id"] = report.id
            if "title" not in kwargs:
                kwargs["title"] = report.title
            if "description" not in kwargs:
                kwargs["description"] = report.description

        case = cls.build(**kwargs)
        db.add(case)
        await db.commit()
        await db.refresh(case)
        return case


class NotificationFactory(factory.Factory):
    class Meta:
        model = Notification

    id = LazyFunction(uuid.uuid4)
    type = NotificationType.status_change
    payload = LazyFunction(lambda: {"message": "Your report status has updated"})
    read = False
    user_id = None

    @classmethod
    async def create_async(cls, db: AsyncSession, **kwargs: Any) -> Notification:
        if "user" in kwargs:
            user = kwargs.pop("user")
            kwargs["user_id"] = user.id
        elif "user_id" not in kwargs or kwargs["user_id"] is None:
            user = await UserFactory.create_async(db)
            kwargs["user_id"] = user.id

        notification = cls.build(**kwargs)
        db.add(notification)
        await db.commit()
        await db.refresh(notification)
        return notification
