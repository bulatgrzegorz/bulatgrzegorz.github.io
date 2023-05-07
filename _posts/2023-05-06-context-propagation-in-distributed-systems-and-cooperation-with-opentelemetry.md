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

# Tracing introduction

While building software systems sooner or later you will come across communication that happens between some separate components.
It could be front-end calling back-end, it could be distributed microservice architecture deployed over huge cluster.
Nevertheless we will end up with executions that are being handled by separate processes - and finally we would probably like to correlate them in order to investigate some problems, analyze performance bottlenecks or just read logs from those separate processes joint together.

![system](/assets/img/posts/contextpropagation/system_graph.png)

In past there we had multiple libraries, code circulate on stackoverflow that was supposed to handle those correlations for us. Problem, as usually was with such local solutions - no standardization.

This has changed with publication and popularization of [W3C Recommendation of TraceContext](https://www.w3.org/TR/trace-context/#trace-context-http-headers-format). It does defines HTTP headers and their value format that should be used in order to propagate context information across distributed systems. Later also other protocols was described (however for now only as internal documents - without official standing):
 * MQTT: https://w3c.github.io/trace-context-mqtt/
 * AMQP: https://w3c.github.io/trace-context-amqp/

About tracing in asynchronous communication in messaging systems I highly recommend OpenTelemetry specification: https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/messaging/.

# Usage

Am not going to write another post explaining how to integrate OpenTelemetry with your C# project. There are already many materials explaining it in great details (starting with OpenTelemetry [site](https://opentelemetry.io/docs/instrumentation/net/getting-started/)), and this is also not topic of this post.

What I would like to introduce, is the ease in which you can integrate your communication library with tracing and allow users to use it in unified and simple way.

