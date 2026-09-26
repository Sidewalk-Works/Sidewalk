import asyncio
import sys
from pathlib import Path

# Add apps/api to sys.path
api_dir = Path(__file__).resolve().parent.parent / "apps" / "api"
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from src.core.config import get_settings
from src.core.enums import CaseStatus, ReportCategory, ReportStatus
from src.core.models import Base
from src.core.security import hash_password
from src.models import Case, Report, User


async def seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with session_factory() as session:
        # Check if already seeded
        admin_check = await session.execute(select(User).where(User.email == "admin@sidewalk.local"))
        if admin_check.scalar_one_or_none():
            print("Database already seeded")
            return

        # 1. Admin user
        admin = User(
            email="admin@sidewalk.local",
            password_hash=hash_password("password123"),
            is_admin=True,
            is_active=True,
        )
        session.add(admin)

        # 2. Two regular users
        user1 = User(
            email="user1@sidewalk.local",
            password_hash=hash_password("password123"),
            is_admin=False,
            is_active=True,
        )
        user2 = User(
            email="user2@sidewalk.local",
            password_hash=hash_password("password123"),
            is_admin=False,
            is_active=True,
        )
        session.add_all([user1, user2])
        await session.flush()

        # 3. 10 reports spread across categories and statuses
        report_data = [
            ("Pothole on 1st Ave", "Large pothole causing traffic slowdown", ReportCategory.road, ReportStatus.submitted, user1.id),
            ("Overflowing Garbage Bin", "Public trash can overflowing in the park", ReportCategory.waste, ReportStatus.under_review, user1.id),
            ("Broken Streetlight", "Streetlight not working on Maple St", ReportCategory.infrastructure, ReportStatus.verified, user1.id),
            ("Illegal Dumping", "Debris left in the alleyway", ReportCategory.environment, ReportStatus.assigned, user1.id),
            ("Water Pipe Leak", "Water bubbling up from under sidewalk", ReportCategory.utility, ReportStatus.in_progress, user1.id),
            ("Missing Stop Sign", "Sign knocked down at 4th and Oak", ReportCategory.road, ReportStatus.resolved, user2.id),
            ("Graffiti on Community Center", "Spray paint on north wall", ReportCategory.infrastructure, ReportStatus.closed, user2.id),
            ("Fallen Tree Branch", "Large branch blocking bike lane", ReportCategory.environment, ReportStatus.submitted, user2.id),
            ("Clogged Storm Drain", "Street flooding during heavy rain", ReportCategory.utility, ReportStatus.under_review, user2.id),
            ("Damaged Sidewalk Curb", "Trip hazard near bus stop", ReportCategory.road, ReportStatus.verified, user2.id),
        ]

        reports = []
        for title, desc, cat, stat, u_id in report_data:
            rep = Report(
                title=title,
                description=desc,
                category=cat.value,
                status=stat.value,
                user_id=u_id,
                media_urls=[],
            )
            session.add(rep)
            reports.append(rep)
        await session.flush()

        # 4. Create cases for some reports
        case_reports = [reports[2], reports[4], reports[5]]
        cases = []
        for rep in case_reports:
            case = Case(
                report_id=rep.id,
                title=f"Case: {rep.title}",
                description=f"Action items for {rep.title}",
                status=CaseStatus.opened.value,
                assigned_to_id=admin.id,
            )
            session.add(case)
            cases.append(case)

        await session.commit()

        print("Seeding completed successfully:")
        print("  - Users: 3 (1 admin, 2 regular)")
        print(f"  - Reports: {len(reports)}")
        print(f"  - Cases: {len(cases)}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
