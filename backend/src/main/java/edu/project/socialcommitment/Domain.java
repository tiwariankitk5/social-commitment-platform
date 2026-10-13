package edu.project.socialcommitment;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.LocalDate;

enum CommitmentStatus {
    PROPOSED, ACCEPTED, IN_PROGRESS, COMPLETED, OVERDUE, CANCELLED,
    REPLACEMENT_REQUESTED, REASSIGNED, BLOCKED, AT_RISK
}

@Entity
class Plan {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @NotBlank public String title;
    @Column(length = 2000) public String description;
    public String category = "Other";
    public LocalDate startDate;
    public LocalDate endDate;
    public String status = "ACTIVE";
    public String organizer = "Demo Organizer";
    public Instant createdAt = Instant.now();

    protected Plan() {}
    Plan(String title, String description, String category, LocalDate startDate, LocalDate endDate, String organizer) {
        this.title = title; this.description = description; this.category = category;
        this.startDate = startDate; this.endDate = endDate; this.organizer = organizer;
    }
}

@Entity
class Commitment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @NotNull public Long planId;
    @NotBlank public String title;
    @Column(length = 2000) public String description;
    @NotBlank public String owner;
    public LocalDate deadline;
    public String priority = "MEDIUM";
    @Enumerated(EnumType.STRING)
    public CommitmentStatus status = CommitmentStatus.PROPOSED;
    public boolean affected = false;
    public String impactReason;
    public Instant createdAt = Instant.now();
    public Instant updatedAt = Instant.now();

    protected Commitment() {}
    Commitment(Long planId, String title, String description, String owner, LocalDate deadline, String priority) {
        this.planId = planId; this.title = title; this.description = description;
        this.owner = owner; this.deadline = deadline; this.priority = priority;
        this.status = CommitmentStatus.ACCEPTED;
    }
}

@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"prerequisiteId", "dependentId"}))
class Dependency {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @NotNull public Long prerequisiteId;
    @NotNull public Long dependentId;
    public Instant createdAt = Instant.now();
    protected Dependency() {}
    Dependency(Long prerequisiteId, Long dependentId) {
        this.prerequisiteId = prerequisiteId; this.dependentId = dependentId;
    }
}

@Entity
class Activity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public Long planId;
    public Long commitmentId;
    public String actor;
    public String action;
    @Column(length = 2000) public String details;
    public Instant createdAt = Instant.now();
    protected Activity() {}
    Activity(Long planId, Long commitmentId, String actor, String action, String details) {
        this.planId=planId; this.commitmentId=commitmentId; this.actor=actor;
        this.action=action; this.details=details;
    }
}

@Entity
class ReplacementRequest {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public Long commitmentId;
    public String requester;
    @Column(length = 1000) public String reason;
    public String status = "PENDING";
    public String reviewer;
    public String newOwner;
    public Instant createdAt = Instant.now();
    public Instant decidedAt;
    protected ReplacementRequest() {}
    ReplacementRequest(Long commitmentId, String requester, String reason) {
        this.commitmentId=commitmentId; this.requester=requester; this.reason=reason;
    }
}

@Entity
class AppNotification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public Long planId;
    public Long commitmentId;
    public String recipient;
    public String title;
    @Column(length = 2000) public String message;
    public boolean read = false;
    public Instant createdAt = Instant.now();
    protected AppNotification() {}
    AppNotification(Long planId, Long commitmentId, String recipient, String title, String message) {
        this.planId=planId; this.commitmentId=commitmentId; this.recipient=recipient;
        this.title=title; this.message=message;
    }
}
