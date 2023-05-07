---
date: 2023-05-06 18:40:35
layout: post
title: "Context propagation in distributed systems and cooperation with OpenTelemetry"
subtitle:
description: >-
  How to propagate context between distributed systems and take advantage of it using OpenTelemetry 
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1683401619/blog/context_propagation_vhvxcj.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/c_scale,w_380/v1683401619/blog/context_propagation_vhvxcj.jpg
category: blog
tags:
  - http
  - c#
  - communication
  - openTelemetry
  - tracing
author: bulatgrzegorz
paginate: false
---

While building software systems sooner or later you will come across communication that happens between some separate components.
It could be front-end calling back-end, it could be distributed microservice architecture deployed over huge cluster.
Nevertheless we will end up with executions that are being handled by separate processes - and finally we would probably like to correlate them in order to investigate some problems, analyze performance bottlenecks or just read logs from those separate processes joint together.

![system](/assets/img/posts/contextpropagation/system_graph.png)