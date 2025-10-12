---
date: 2025-10-09 10:00:00
layout: post
title: "The Infrastructure Configuration Nightmare: When Separation Creates Slowdown"
subtitle: "Why centralized infrastructure repositories might be killing your deployment velocity"
description: >-
  Explore how centralized infrastructure repositories create bottlenecks in large organizations and discover a better approach using in-codebase manifests that maintains security while dramatically improving deployment speed.
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1760217773/blog/central.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/t_To43/v1760217773/blog/central.jpg
category: blog
tags:
  - infrastructure
  - devops
  - deployment
  - terraform
  - kafka
  - ci-cd
author: bulatgrzegorz
paginate: false
---

# A simple feature story

It's Monday morning, coffee is steaming. You've just finished implementing a great new feature that your users have been asking for. The code is clean, tested, and ready to ship. It shouldn't take longer than 30 minutes to deploy to production, right?

Week later, you're still trying to get it deployed.

Sound familiar?

Here's what actually happened: Your feature needs a new Kafka topic. Simple enough, right? But in your organization, Kafka topics aren't created by your service. They're managed in a centralized `kafka-infrastructure` repository. So you:

1. Context switch to the kafka-infra repo
2. Find the YAML file for your environment
3. Add your topic configuration
4. Create a PR
5. Wait for the platform team to review it
6. Wait for the scheduled deployment window 
7. Create a JIRA ticket for production deployment
8. Trigger the deployment
9. Finally return to your actual feature

Oh, and your feature also needs a new database table. Time to repeat this process in the `database-migrations` repository. And don't forget the secrets in the `secrets-management` repository.

**What if I told you there's a better way that's just as secure but dramatically faster?**

# The Current State: A Maze of Repositories

![maze](/assets/img/posts/infrastucturenightmare/maze.webp)

In large organizations, infrastructure is typically managed by different specialized teams. Naturally each team wants to control changes being made in their part of the system world. What it results in are separated repositories for configuration:

- ☁️ `terraform-infrastructure` - Cloud resource definitions
- 🗄️ `ansible-configurations` - Server configurations
- ✉️ `kafka-infrastructure` - Kafka topics and ACLs
- 💾 `database-migrations` - Database schemas
- 🤫 `secrets-management` - Application secrets

Each repository may have its own:
- Repository system (bitbucket, github, ...)
- Review process
- Approval workflow
- Deployment pipeline (Jenkins, Octopus Deploy, GitHub Actions, ...)
- Deployment schedule
- Production gates (CAB approvals, JIRA tickets)

The idea is that this separation provides:
- **Security** through approval gates and controlled review process
- **Control** through centralized management
- **Consistency** through standardization

But in practice, it creates something else entirely: **a bottleneck that slows everyone down**.

# Multi-Repository Fragmentation

![defragmentation](/assets/img/posts/infrastucturenightmare/defragmentation.webp)

When you need to deploy a feature that touches multiple infrastructure components, you're faced with a coordination nightmare.

**Context Switching Overhead**
- Jumping between multiple configuration repositories
- Different code review tools and processes
- Different teams reviewing each PR
- Tracking the status of multiple PRs in parallel

**The Deployment Coordination Nightmare**

This is where things get truly painful. Each centralized repository doesn't just have a different codebase - it has a completely different deployment mechanism:

* Kafka might be deployed through Octopus Runbook (Each 2h)
* Database schemas deployed on-demand through custom script
* Secrets - Jenkins pipeline
* Terraform - Github Actions

As a developer, you need to maintain a mental model of:
- Which repository handles what
- Which deployment tool deploys each repository
- What the deployment schedule is
- Who approves what and how to reach them
- How to verify each deployment succeeded

This knowledge is typically scattered across:
- Outdated Confluence pages
- Slack channel pinned messages
- Tribal knowledge of senior engineers

---
**What was estimated as a 30-minute deployment becomes a two-week battle.**

# Cross-Repository Dependencies

![dependency](https://imgs.xkcd.com/comics/dependency.png)

Some infrastructure repositories may have **dependencies on each other**, creating a complex chain of prerequisites that must be satisfied in a specific order:

* Some infrastructure components need to be created before others (e.g., cloud resources before application secrets)
* Secrets might need to wait for some resources to be created first
* etc.

Then you can't just create all these PRs in parallel and hope for the best. There's a strict ordering for each scenario.

## The Knowledge Problem Multiplied

Not only do you need to know:
- Which repos exist
- How to deploy each one
- Who approves what

You also need to know:
- Which repos depend on which
- The correct order to deploy them
- What information flows between them (endpoints, credentials)
- How to test dependencies locally (you usually can't)

# Version Drift & Configuration Mismatches

![drift](/assets/img/posts/infrastucturenightmare/versionmismatch.png)

When infrastructure and code are deployed separately, version consistency becomes a constant struggle.

**The mismatch scenario:**

Your service v1.2.3 is running in production
But which infrastructure version is it using?

* **Kafka topics** - deployed last Tuesday from commit abc123
* **Database schema** - deployed Thursday from commit def456
* **Secrets** - deployed... when exactly?
* **Terraform resources** - deployed last month?

Nobody knows for sure. 🤷

**The consequences:**
* *"Works in DEV but not PROD"* - classic syndrome where environments drift apart
* Testing becomes unreliable - you're never testing the exact combination that runs in production
* Rollbacks are nightmarish - which infrastructure version do you roll back to?
* Debugging production issues - was it the code change or that infrastructure change from last week?

When things go wrong, you're faced with partial states. Kafka topic deployed successfully but database migration failed halfway. Is the service working? Half-working? Should you roll back just the database? Just the service? Both?

# The Knowledge Burden

![knowledge](/assets/img/posts/infrastucturenightmare/book.jpg)

All these problems compound into a massive knowledge burden that teams must carry.

**What developers need to master:**

* Where to find repositories responsible for given part of infrastructure
* How to perform given changes (inconsistent structure, internal rules, etc.)
* How to receive approvals
* How are those released

and many, many more...

**The onboarding nightmare:**

Each new developer will require solid time to get use to all processes, still full bookmark folder of wiki pages would be required. 

# Blast Radius Problem

![blast](/assets/img/posts/infrastucturenightmare/blast.jpg)

There's another insidious problem with centralized infrastructure repositories: **one person's mistake blocks everyone**.

## The Tragedy of the Commons

Picture this: Your organization has 50 teams, all deploying services. They all share the same centralized repositories. On a typical Monday:

**9 AM:**
- Your team: Merge PR adding a new Kafka topic (perfectly valid)
- Team X: Merge PR with incorrect Kafka ACL configuration

**10 AM** - Scheduled deployment fails ❌ on Team X error

**Your change was perfectly fine, but is blocked anyway.**

## The Debugging Nightmare

When the deployment fails, someone needs to figure out why:

1. Check deployment logs (which system? Octopus? Jenkins?)
2. Review all 15 PRs merged since the last successful deployment identifying which caused the failure
3. Contact the team responsible
4. Wait for them to fix it
5. Re-run the deployment
6. Hope nothing else broke in the meantime 🤞

Meanwhile, your service launch is delayed. Your stakeholders are asking questions. Your team is blocked.

## The Validation Gap

"Why don't you just have better pre-merge validation?" you might ask.

Great question. The problem is that comprehensive validation is extremely difficult in centralized repositories:

**Why Pre-Merge Validation Fails:**

1. **Environment-specific issues** - Config works in DEV, fails in PROD
2. **Timing-based conflicts** - Two teams modify the same resource
3. **Complex interactions** - Change A + Change B = disaster
4. **Schema validation ≠ Runtime validation** - Syntax is correct, semantics are wrong

**The broken window effect is real.** Once the deployment pipeline is seen as unreliable, the entire development process slows down.

# Repository Bloat Problem

![bloat](https://render.fineartamerica.com/images/rendered/share/61808751&domainId=1)

As your organization grows, centralized infrastructure repositories become increasingly unwieldy. What started as a simple, organized approach transforms into a performance nightmare.

* Deployment time is getting longer and longer
* Finding your configuration is like needle in haystack
* Merge conflicts are more frequent
* CI/CD queues are growing while agents being occupied by neverending actions
* Cost multiplication caused by unnecessary checks on thousands of entities
* Changes become more challenging as you are working with bigger files, directories

## The Performance Death Spiral

**Every** operation gets slower.

Starting from cloning repository, running necessary local actions, into deployment. Time of each layer is accumulating, making context switch pricier and pricer.

Remember failed deployment caused by Team X? Imagine feedback loop after each fix getting dozens of minutes.

You catch yourself after whole day achieving nothing, trying to understand how this happened, it can be very depressing (even more when you trying to explain what you did day before on morning standup).

# The Way Forward

![way](/assets/img/posts/infrastucturenightmare/betterway.jpg)

So what's the alternative? **In-codebase infrastructure manifests.**

Instead of scattering configuration across multiple repositories, keep it next to the code that uses it:

```
my-service/
├── src/
├── tests/
└── infrastructure/
    ├── database.yaml
    ├── kafka-topics.yaml
    └── secrets.yaml
```

**Example: Single deployment pipeline**

```yaml
deploy-to-prod:
  steps:
    1. Validate manifests
    2. Deploy schema
    3. Create Kafka topic
    4. Create secrets
    5. Run database migration
    6. Deploy service
    7. Run smoke tests
```

Everything in order. Everything versioned. Everything atomic.

**Who builds what:**

The key insight is that **platform teams still own the implementation**. They build and maintain the Terraform modules, Ansible playbooks, and deployment scripts. Service teams don't write infrastructure code - they just declare what they need in manifests and invoke the platform-provided tooling from their pipelines.

In centralized repos, platform teams build AND run everything. In the in-codebase approach, platform teams build reusable tools while service teams invoke them. Same expertise, same control, better velocity.

---

**What changes:**

* **Single PR** - Code and infrastructure together
* **Atomic deployment** - Everything deploys as one unit, version consistency guaranteed
* **No blast radius** - Your deployment can't be blocked by other teams
* **Dependencies resolved** - Pipeline handles ordering automatically
* **Same security** - Dynamic approvals based on what changed
* **Constant performance** - Your velocity doesn't degrade as company grows

## "But what about security?"

Instead of separate repositories with owner teams reviewing each PR, we may route approvals dynamically:
* Code changes → Team approval
* Database schema → Team + DBA approval
* Kafka topics → Team + Platform approval
* Secrets → Team + Security approval

Same gates. Same people reviewing. Better context (they see code + infrastructure together).

## "But what about shared infrastructure?"

Keep truly shared infrastructure (VPCs, clusters, policies) centralized. Move service-specific infrastructure (your Kafka topics, your database migrations, secrets) into service repos.

It's not all-or-nothing. It's a spectrum.

# Final Thoughts

If deploying a simple feature takes two weeks in your organization, it's not because you need that much security review. It's because you have process debt.

Centralized infrastructure sounds natural, keeping it close to managing teams.

This works perfectly in an ideal world where:
* No "pings" are required to remind about your 2-line PR waiting for third day
* Nobody makes mistakes that block the whole release pipeline
* Deployments are fast, no matter how big the configuration repo grows
* Everyone remembers every detail about how to proceed with changes in all those separate repositories

But we don't live in that world.

----
World changed. Modern tools (Kubernetes, Terraform, GitOps) enable atomic deployments. Modern organizations embrace service ownership. Modern security happens through automated validation and dynamic approvals, not synthetic separation.

**The goal isn't to eliminate oversight. The goal is to eliminate waiting.**

Your developers shouldn't need tribal knowledge just to create a topic. Your platform team shouldn't be overwhelmed with trivial reviews. Your organization shouldn't be waiting weeks to ship features.

**The infrastructure configuration nightmare is solvable.**

Maybe it's time to wake up.

![dream](/assets/img/posts/infrastucturenightmare/dream.jpg)