package edu.project.socialcommitment;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDate;

@Configuration
class DemoDataInitializer {
    @Bean
    CommandLineRunner seedDemoWorkspace(PlanRepository plans, CommitmentRepository commitments,
                                        DependencyRepository dependencies, ActivityRepository activities,
                                        AppNotificationRepository notifications) {
        return args -> {
            if (plans.count() > 0) return;

            Plan plan = plans.save(new Plan(
                    "Campus Sustainability Drive",
                    "A student-led weekend initiative to make the campus cleaner, greener, and more connected.",
                    "Volunteer",
                    LocalDate.now().plusDays(7),
                    LocalDate.now().plusDays(21),
                    "Aman Kumar"));

            Commitment venue = commitments.save(new Commitment(plan.id, "Confirm cleanup zones",
                    "Coordinate with campus operations and publish the approved zone map.", "Aman Kumar",
                    LocalDate.now().plusDays(9), "HIGH"));
            Commitment partners = commitments.save(new Commitment(plan.id, "Invite community partners",
                    "Confirm student clubs and local partners for each cleanup zone.", "Neha Sharma",
                    LocalDate.now().plusDays(12), "MEDIUM"));
            Commitment supplies = commitments.save(new Commitment(plan.id, "Arrange collection supplies",
                    "Reserve gloves, bags, bins, water stations, and first-aid kits.", "Riya Patel",
                    LocalDate.now().plusDays(14), "HIGH"));
            Commitment campaign = commitments.save(new Commitment(plan.id, "Launch volunteer campaign",
                    "Share the registration link and the final event brief with volunteers.", "Kabir Singh",
                    LocalDate.now().plusDays(16), "MEDIUM"));

            dependencies.save(new Dependency(venue.id, partners.id));
            dependencies.save(new Dependency(partners.id, campaign.id));
            dependencies.save(new Dependency(supplies.id, campaign.id));
            campaign.status = CommitmentStatus.BLOCKED;
            campaign.affected = true;
            campaign.impactReason = "Waiting for community partners and collection supplies";
            commitments.save(campaign);

            activities.save(new Activity(plan.id, null, "Aman Kumar", "PLAN_CREATED", "Created the Campus Sustainability Drive plan"));
            activities.save(new Activity(plan.id, venue.id, "Aman Kumar", "COMMITMENT_CREATED", "Confirmed ownership of cleanup zones"));
            activities.save(new Activity(plan.id, campaign.id, "System", "DEPENDENCY_ADDED", "Volunteer campaign is waiting on its prerequisites"));
            notifications.save(new AppNotification(plan.id, campaign.id, "Kabir Singh", "Waiting on prerequisites",
                    "Launch volunteer campaign will be ready once its dependencies are completed."));
        };
    }
}
