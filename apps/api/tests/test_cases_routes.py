def test_filter_cases_by_status_returns_only_matching_cases():
    # Arrange: create cases with different statuses
    opened_case = create_case(status="opened")
    closed_case = create_case(status="closed")
    in_progress_case = create_case(status="in_progress")

    # Act
    response = client.get("/cases?status=open")

    # Assert exact membership, not just response success
    assert response.status_code == 200

    returned_ids = {case["id"] for case in response.json()}

    assert returned_ids == {opened_case.id}
    assert closed_case.id not in returned_ids
    assert in_progress_case.id not in returned_ids

    def test_follow_case_persists_follow_record():
    case = create_case()
    user = authenticated_user

    response = client.post(f"/cases/{case.id}/follow")

    assert response.status_code == 204

    follow = db_session.query(CaseFollow).filter_by(
        case_id=case.id,
        user_id=user.id,
    ).first()

    assert follow is not None
    assert follow.case_id == case.id
    assert follow.user_id == user.id

    def test_unfollow_case_removes_persisted_follow():
    case = create_case()
    create_follow(user=authenticated_user, case=case)

    response = client.delete(f"/cases/{case.id}/follow")

    assert response.status_code == 204

    follow = db_session.query(CaseFollow).filter_by(
        case_id=case.id,
        user_id=authenticated_user.id,
    ).first()

    assert follow is None