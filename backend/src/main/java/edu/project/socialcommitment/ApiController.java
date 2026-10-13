package edu.project.socialcommitment;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(originPatterns = "${CORS_ALLOWED_ORIGINS:http://localhost:5173,http://127.0.0.1:5173}")
public class ApiController {
    private final PlanRepository plans;
    private final CommitmentRepository commitments;
    private final DependencyRepository dependencies;
    private final ActivityRepository activities;
    private final ReplacementRequestRepository replacements;
    private final AppNotificationRepository notifications;

    public ApiController(PlanRepository plans, CommitmentRepository commitments,
                         DependencyRepository dependencies, ActivityRepository activities,
                         ReplacementRequestRepository replacements, AppNotificationRepository notifications) {
        this.plans=plans; this.commitments=commitments; this.dependencies=dependencies;
        this.activities=activities; this.replacements=replacements; this.notifications=notifications;
    }

    @GetMapping("/health")
    public Map<String,Object> health() {
        return Map.of("status","UP","application","Social Commitment Platform","time",Instant.now());
    }

    @GetMapping("/dashboard")
    public Map<String,Object> dashboard() {
        List<Commitment> all=commitments.findAll();
        long completed=all.stream().filter(c -> c.status==CommitmentStatus.COMPLETED).count();
        long overdue=all.stream().filter(c -> c.status==CommitmentStatus.OVERDUE ||
                (c.deadline!=null && c.deadline.isBefore(LocalDate.now()) &&
                 c.status!=CommitmentStatus.COMPLETED && c.status!=CommitmentStatus.CANCELLED)).count();
        long affected=all.stream().filter(c -> c.affected).count();
        return Map.of("plans",plans.count(),"commitments",all.size(),"completed",completed,
                "overdue",overdue,"affected",affected,"pendingReplacements",replacements.findAll().stream().filter(r -> "PENDING".equals(r.status)).count());
    }

    @GetMapping("/plans")
    public List<Plan> listPlans() { return plans.findAllByOrderByCreatedAtDesc(); }

    @GetMapping("/commitments")
    public List<Commitment> listCommitments() {
        List<Commitment> all = commitments.findAllByOrderByCreatedAtDesc();
        all.forEach(this::refreshOverdue);
        return all;
    }

    public record PlanRequest(@jakarta.validation.constraints.NotBlank String title, String description,
                              String category, LocalDate startDate, LocalDate endDate, String organizer) {}

    @PostMapping("/plans")
    public Plan createPlan(@Valid @RequestBody PlanRequest req) {
        if (req.startDate()!=null && req.endDate()!=null && req.endDate().isBefore(req.startDate()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"End date cannot be before start date");
        Plan p=plans.save(new Plan(req.title(), req.description(), blankDefault(req.category(),"Other"),
                req.startDate(),req.endDate(),blankDefault(req.organizer(),"Demo Organizer")));
        activities.save(new Activity(p.id,null,p.organizer,"PLAN_CREATED","Created plan: "+p.title));
        return p;
    }

    @GetMapping("/plans/{id}")
    public Plan getPlan(@PathVariable Long id) { return plans.findById(id).orElseThrow(() -> notFound("Plan")); }

    @PutMapping("/plans/{id}")
    public Plan updatePlan(@PathVariable Long id, @Valid @RequestBody PlanRequest req) {
        Plan p=plans.findById(id).orElseThrow(() -> notFound("Plan"));
        p.title=req.title(); p.description=req.description(); p.category=blankDefault(req.category(),"Other");
        p.startDate=req.startDate(); p.endDate=req.endDate(); p.organizer=blankDefault(req.organizer(),p.organizer);
        return plans.save(p);
    }

    @GetMapping("/plans/{id}/commitments")
    public List<Commitment> planCommitments(@PathVariable Long id) {
        if (!plans.existsById(id)) throw notFound("Plan");
        List<Commitment> list=commitments.findByPlanIdOrderByDeadlineAsc(id);
        list.forEach(this::refreshOverdue);
        return list;
    }

    public record CommitmentRequest(@jakarta.validation.constraints.NotBlank String title, String description,
                                    @jakarta.validation.constraints.NotBlank String owner, LocalDate deadline,
                                    String priority) {}

    @PostMapping("/plans/{id}/commitments")
    public Commitment createCommitment(@PathVariable Long id, @Valid @RequestBody CommitmentRequest req) {
        Plan p=plans.findById(id).orElseThrow(() -> notFound("Plan"));
        Commitment cm=new Commitment(id,req.title(),req.description(),req.owner(),req.deadline(),blankDefault(req.priority(),"MEDIUM").toUpperCase());
        cm=commitments.save(cm);
        activities.save(new Activity(id,cm.id,req.owner(),"COMMITMENT_CREATED","Created commitment: "+cm.title));
        return cm;
    }

    @PutMapping("/commitments/{id}")
    public Commitment updateCommitment(@PathVariable Long id, @Valid @RequestBody CommitmentRequest req) {
        Commitment cm=commitments.findById(id).orElseThrow(() -> notFound("Commitment"));
        cm.title=req.title(); cm.description=req.description(); cm.owner=req.owner(); cm.deadline=req.deadline();
        cm.priority=blankDefault(req.priority(),"MEDIUM").toUpperCase(); cm.updatedAt=Instant.now();
        cm=commitments.save(cm);
        activities.save(new Activity(cm.planId,cm.id,req.owner(),"COMMITMENT_UPDATED","Updated commitment details"));
        return cm;
    }

    public record StatusRequest(@jakarta.validation.constraints.NotBlank String status, String actor, String reason) {}

    @PatchMapping("/commitments/{id}/status")
    @Transactional
    public Commitment updateStatus(@PathVariable Long id, @Valid @RequestBody StatusRequest req) {
        Commitment cm=commitments.findById(id).orElseThrow(() -> notFound("Commitment"));
        CommitmentStatus next;
        try { next=CommitmentStatus.valueOf(req.status().toUpperCase()); }
        catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown commitment status"); }
        CommitmentStatus old=cm.status;
        if (old==CommitmentStatus.COMPLETED && next!=CommitmentStatus.COMPLETED)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Completed commitments cannot be reopened in this prototype");
        cm.status=next; cm.updatedAt=Instant.now();
        if (next==CommitmentStatus.CANCELLED || next==CommitmentStatus.OVERDUE) {
            List<Commitment> impacted=downstream(cm.id);
            for (Commitment d: impacted) {
                if (d.status!=CommitmentStatus.COMPLETED && d.status!=CommitmentStatus.CANCELLED) {
                    d.affected=true;
                    d.impactReason="Prerequisite '"+cm.title+"' is "+next.name().toLowerCase();
                    if (d.status!=CommitmentStatus.OVERDUE) d.status=CommitmentStatus.AT_RISK;
                    commitments.save(d);
                    notifications.save(new AppNotification(d.planId,d.id,d.owner,"Dependency affected",
                            "Commitment '"+d.title+"' may be affected because '"+cm.title+"' is "+next.name().toLowerCase()+"."));
                    activities.save(new Activity(d.planId,d.id,blankDefault(req.actor(),"System"),"DEPENDENCY_IMPACT",
                            "Affected by "+cm.title+" ("+next.name()+")"));
                }
            }
        }
        if (next==CommitmentStatus.COMPLETED) {
            cm.affected=false; cm.impactReason=null;
            // A dependent is cleared only if all its prerequisites are complete.
            for (Dependency dep: dependencies.findByPrerequisiteId(cm.id)) {
                Commitment child=commitments.findById(dep.dependentId).orElse(null);
                if (child!=null && prerequisitesComplete(child.id)) {
                    child.affected=false; child.impactReason=null;
                    if (child.status==CommitmentStatus.AT_RISK || child.status==CommitmentStatus.BLOCKED)
                        child.status=CommitmentStatus.ACCEPTED;
                    commitments.save(child);
                }
            }
        }
        cm=commitments.save(cm);
        activities.save(new Activity(cm.planId,cm.id,blankDefault(req.actor(),"Demo User"),"STATUS_CHANGED",
                old+" -> "+next+(req.reason()==null?"":"; "+req.reason())));
        return cm;
    }

    @GetMapping("/plans/{id}/dependencies")
    public List<Dependency> listDependencies(@PathVariable Long id) {
        if (!plans.existsById(id)) throw notFound("Plan");
        Set<Long> ids=new HashSet<>();
        commitments.findByPlanIdOrderByDeadlineAsc(id).forEach(c -> ids.add(c.id));
        return dependencies.findAllByOrderByIdAsc().stream()
                .filter(d -> ids.contains(d.prerequisiteId) && ids.contains(d.dependentId)).toList();
    }

    public record DependencyRequest(Long prerequisiteId, Long dependentId) {}

    @PostMapping("/dependencies")
    @Transactional
    public Dependency addDependency(@RequestBody DependencyRequest req) {
        if (req.prerequisiteId()==null || req.dependentId()==null) throw bad("Both commitment IDs are required");
        if (req.prerequisiteId().equals(req.dependentId())) throw bad("A commitment cannot depend on itself");
        Commitment a=commitments.findById(req.prerequisiteId()).orElseThrow(() -> notFound("Prerequisite commitment"));
        Commitment b=commitments.findById(req.dependentId()).orElseThrow(() -> notFound("Dependent commitment"));
        if (!a.planId.equals(b.planId)) throw bad("Dependencies must be within the same plan");
        if (dependencies.existsByPrerequisiteIdAndDependentId(a.id,b.id)) throw new ResponseStatusException(HttpStatus.CONFLICT,"Dependency already exists");
        if (reachable(b.id,a.id)) throw bad("Dependency would create a cycle");
        Dependency dep=dependencies.save(new Dependency(a.id,b.id));
        activities.save(new Activity(a.planId,b.id,"Demo User","DEPENDENCY_ADDED",a.title+" -> "+b.title));
        if (a.status!=CommitmentStatus.COMPLETED) {
            b.affected=true; b.impactReason="Waiting for prerequisite '"+a.title+"'";
            if (b.status!=CommitmentStatus.COMPLETED && b.status!=CommitmentStatus.CANCELLED) b.status=CommitmentStatus.BLOCKED;
            commitments.save(b);
        }
        return dep;
    }

    @DeleteMapping("/dependencies/{id}")
    public Map<String,Object> deleteDependency(@PathVariable Long id) {
        Dependency dep=dependencies.findById(id).orElseThrow(() -> notFound("Dependency"));
        dependencies.delete(dep);
        activities.save(new Activity(null,dep.dependentId,"Demo User","DEPENDENCY_REMOVED","Removed dependency "+dep.id));
        return Map.of("deleted",true);
    }

    @GetMapping("/commitments/{id}/impact")
    public Map<String,Object> impact(@PathVariable Long id) {
        Commitment source=commitments.findById(id).orElseThrow(() -> notFound("Commitment"));
        List<Commitment> affected=downstream(id);
        return Map.of("source",source,"affected",affected,"count",affected.size(),
                "summary",affected.isEmpty()?"No downstream commitments found":affected.size()+" downstream commitment(s) may be affected.");
    }

    @GetMapping("/plans/{id}/activity")
    public List<Activity> activity(@PathVariable Long id) {
        if (!plans.existsById(id)) throw notFound("Plan");
        return activities.findTop100ByPlanIdOrderByCreatedAtDesc(id);
    }

    @GetMapping("/activity")
    public List<Activity> allActivity() { return activities.findTop100ByOrderByCreatedAtDesc(); }

    @GetMapping("/replacements")
    public List<ReplacementRequest> listReplacements() { return replacements.findAllByOrderByCreatedAtDesc(); }

    public record ReplacementCreate(Long commitmentId, String requester, String reason) {}
    @PostMapping("/replacements")
    public ReplacementRequest createReplacement(@RequestBody ReplacementCreate req) {
        Commitment cm=commitments.findById(req.commitmentId()).orElseThrow(() -> notFound("Commitment"));
        ReplacementRequest rr=replacements.save(new ReplacementRequest(cm.id,blankDefault(req.requester(),cm.owner),blankDefault(req.reason(),"Unable to complete this commitment.")));
        cm.status=CommitmentStatus.REPLACEMENT_REQUESTED; commitments.save(cm);
        activities.save(new Activity(cm.planId,cm.id,rr.requester,"REPLACEMENT_REQUESTED",rr.reason));
        notifications.save(new AppNotification(cm.planId,cm.id,cm.owner,"Replacement requested","A replacement has been requested for '"+cm.title+"'."));
        return rr;
    }

    public record ReplacementDecision(String reviewer, String decision, String newOwner) {}
    @PatchMapping("/replacements/{id}")
    @Transactional
    public ReplacementRequest decideReplacement(@PathVariable Long id, @RequestBody ReplacementDecision req) {
        ReplacementRequest rr=replacements.findById(id).orElseThrow(() -> notFound("Replacement request"));
        if (!"PENDING".equals(rr.status)) throw new ResponseStatusException(HttpStatus.CONFLICT,"Request has already been decided");
        Commitment cm=commitments.findById(rr.commitmentId).orElseThrow(() -> notFound("Commitment"));
        rr.reviewer=blankDefault(req.reviewer(),"Plan Organizer"); rr.decidedAt=Instant.now();
        if ("APPROVE".equalsIgnoreCase(req.decision())) {
            if (req.newOwner()==null || req.newOwner().isBlank()) throw bad("New owner is required");
            String old=cm.owner; cm.owner=req.newOwner().trim(); cm.status=CommitmentStatus.REASSIGNED; cm.affected=false; cm.impactReason=null;
            commitments.save(cm); rr.newOwner=cm.owner; rr.status="APPROVED";
            activities.save(new Activity(cm.planId,cm.id,rr.reviewer,"COMMITMENT_REASSIGNED",old+" -> "+cm.owner));
            notifications.save(new AppNotification(cm.planId,cm.id,old,"Commitment reassigned","Responsibility for '"+cm.title+"' has been transferred."));
            notifications.save(new AppNotification(cm.planId,cm.id,cm.owner,"New commitment assigned","You are now responsible for '"+cm.title+"'."));
        } else if ("REJECT".equalsIgnoreCase(req.decision())) {
            rr.status="REJECTED"; cm.status=CommitmentStatus.ACCEPTED; commitments.save(cm);
            activities.save(new Activity(cm.planId,cm.id,rr.reviewer,"REPLACEMENT_REJECTED","Replacement request rejected"));
        } else throw bad("Decision must be APPROVE or REJECT");
        return replacements.save(rr);
    }

    @GetMapping("/notifications")
    public List<AppNotification> allNotifications() { return notifications.findAllByOrderByCreatedAtDesc(); }

    @PatchMapping("/notifications/{id}/read")
    public AppNotification markRead(@PathVariable Long id) {
        AppNotification n=notifications.findById(id).orElseThrow(() -> notFound("Notification"));
        n.read=true; return notifications.save(n);
    }

    private void refreshOverdue(Commitment c) {
        if (c.deadline!=null && c.deadline.isBefore(LocalDate.now()) &&
            c.status!=CommitmentStatus.COMPLETED && c.status!=CommitmentStatus.CANCELLED &&
            c.status!=CommitmentStatus.REASSIGNED && c.status!=CommitmentStatus.REPLACEMENT_REQUESTED) {
            if (c.status!=CommitmentStatus.OVERDUE) {
                c.status=CommitmentStatus.OVERDUE; c.updatedAt=Instant.now(); commitments.save(c);
            }
        }
    }

    private List<Commitment> downstream(Long sourceId) {
        LinkedHashSet<Long> visited=new LinkedHashSet<>();
        Deque<Long> queue=new ArrayDeque<>(); queue.add(sourceId);
        while(!queue.isEmpty()) {
            Long current=queue.removeFirst();
            for (Dependency d:dependencies.findByPrerequisiteId(current)) {
                if (visited.add(d.dependentId)) queue.addLast(d.dependentId);
            }
        }
        visited.remove(sourceId);
        return visited.stream().map(commitments::findById).filter(Optional::isPresent).map(Optional::get).toList();
    }

    private boolean reachable(Long start, Long target) {
        Set<Long> seen=new HashSet<>(); Deque<Long> q=new ArrayDeque<>(); q.add(start);
        while(!q.isEmpty()) {
            Long n=q.removeFirst();
            if (n.equals(target)) return true;
            if (!seen.add(n)) continue;
            for (Dependency d:dependencies.findByPrerequisiteId(n)) q.addLast(d.dependentId);
        }
        return false;
    }

    private boolean prerequisitesComplete(Long commitmentId) {
        List<Dependency> deps=dependencies.findByDependentId(commitmentId);
        return deps.stream().allMatch(d -> commitments.findById(d.prerequisiteId)
                .map(c -> c.status==CommitmentStatus.COMPLETED).orElse(false));
    }

    private ResponseStatusException notFound(String what) { return new ResponseStatusException(HttpStatus.NOT_FOUND,what+" not found"); }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private String blankDefault(String value,String fallback) { return value==null || value.isBlank()?fallback:value.trim(); }
}
