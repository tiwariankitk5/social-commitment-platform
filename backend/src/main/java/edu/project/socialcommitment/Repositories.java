package edu.project.socialcommitment;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

interface PlanRepository extends JpaRepository<Plan, Long> {
    List<Plan> findAllByOrderByCreatedAtDesc();
}
interface CommitmentRepository extends JpaRepository<Commitment, Long> {
    List<Commitment> findByPlanIdOrderByDeadlineAsc(Long planId);
    List<Commitment> findAllByOrderByCreatedAtDesc();
}
interface DependencyRepository extends JpaRepository<Dependency, Long> {
    List<Dependency> findByPrerequisiteId(Long prerequisiteId);
    List<Dependency> findByDependentId(Long dependentId);
    boolean existsByPrerequisiteIdAndDependentId(Long prerequisiteId, Long dependentId);
    List<Dependency> findAllByOrderByIdAsc();
}
interface ActivityRepository extends JpaRepository<Activity, Long> {
    List<Activity> findTop100ByPlanIdOrderByCreatedAtDesc(Long planId);
    List<Activity> findTop100ByOrderByCreatedAtDesc();
}
interface ReplacementRequestRepository extends JpaRepository<ReplacementRequest, Long> {
    List<ReplacementRequest> findAllByOrderByCreatedAtDesc();
    List<ReplacementRequest> findByCommitmentIdOrderByCreatedAtDesc(Long commitmentId);
}
interface AppNotificationRepository extends JpaRepository<AppNotification, Long> {
    List<AppNotification> findAllByOrderByCreatedAtDesc();
    List<AppNotification> findByRecipientOrderByCreatedAtDesc(String recipient);
}
