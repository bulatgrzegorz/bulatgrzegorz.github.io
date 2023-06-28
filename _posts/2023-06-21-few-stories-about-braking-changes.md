---
date: 2023-06-21 13:27:58
layout: post
title: "Few stories about braking changes"
subtitle:
description: >-
  Examples of changes that are not obvious breaking changes in libraries code
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1687955279/blog/broken_qexurd.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/c_scale,w_380/v1687955279/blog/broken_qexurd.jpg
category: blog
tags:
  - c#
  - libraries
author: bulatgrzegorz
paginate: false
---

# Braking change

Just for start, we may actually try decide what "braking change" actually means. In software we could generalysie it as any change that make code stop runnning or compiling ([link](https://stackoverflow.com/a/21703427)).

More specific defnition of `compatibility` can be found [here](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/version-update-considerations), where term was devided into specific types. Below we will show some examples of non binary-compatible changes.

And as we can easly imagine many of such changes. Where there are some (in .NET world) that seems not so obvious at first galnce.

Many of those we can find when creaiting .NET libraries. Some changes that wouldn't be normally considerend braking will be one when introduced in some specific usage situations.

How much library changes can effect in braking changes can differ in how it is being used. We can distinguish two main types:

### High-level library

This kind of libraries are less sensitive to braking changes - those libraries are being referenced directly in clients application

![dependency-diagram](/assets/img/posts/breakingchanges/high-level-lib-diagram.png)

Those are less sensitive, because even when braking change was introduced, client can decide to change version of it or just modify application itself.

### Low-level library

Harderst in maintaining backward compatibility are low-level libraries, that are used as building blocks - in clients code or as part of others libraries (serializers, parsers, ...). It's different because such high-level libraries may be compiled against older version of library, where API was different. 

![dependency-diagram](/assets/img/posts/breakingchanges/low-level-lib-diagram.png)

# Examples

We will only describe some examples from binary breaking category that in my perspective are quite easy to be missed.

## Method parameters braking change

In this example, we will discussing binary braking change while developing low-level libraries changes that wouldn't be such in normal application code or high-level libraries. 

Let's examine such code example:

`Client app`
```csharp
HighLevelClass.Method();
LowLevelClass.Method(1);
```
`High-level library`
```csharp
public static class HighLevelClass
{
    public static void Method()
    {
        LowLevelClass.Method(1);
        Console.WriteLine("high-level lib");
    }
}
```
`Low-level library`
```csharp
public static class LowLevelClass
{
    public static void Method(int var1) => Console.WriteLine("low-level lib");
}
```

Now let's modify low level library, and add optional parameter to our method:
```csharp
public class LowLevelClass
{
    public static void Method(int var1, string? var2 = null) => Console.WriteLine("Hello from low level lib");
}
```
and reference new version of library implicitly in client project. Everything compiling fine, but after running client code we getting exception:
```
Unhandled exception. System.MissingMethodException: Method not found: 'Void low_level_lib.LowLevelClass.Method(Int32)'.
   at high_level_lib.HighLevelClass.Method()
   at Program.<Main>$(String[] args) in ...\Program.cs:line 4
```

![impossible](/assets/img/posts/breakingchanges/thats-impossible.gif)


That's happening because how optional parameters are being handled by compiler. Let's check lowered code of our client code after library has beed updated:
```csharp
LowLevelClass.Method(1, (string) null);
```
Method invocation was effectively converted to call using all paramaters. This is not happening in high-level library that was already compiled against old version of low-level and such "conversion" didn't happend.

There are few solutions to this problem, we could either:
* Recompile high-level library using new version of low-level library
* Make change in low-level library in little bit different manier:

```csharp
public static class LowLevelClass
{
    public static void Method(int var1) => { }
    public static void Method(int var1, string? var2 = null) => { }
}
```

This way overload of method with just one parameter still exists, making high-level library to work correctly, while in same time we can use overload with new parameter as well in client code.

## Method return type braking change

Same exception would happen if we would try to change return type (even if such is not being used anywhere):
```csharp
public static class LowLevelClass
{
    public static double Method(int var1) => 1;
}
```

Why this isn't allowed has been explaind in great stackoverflow [answer](https://stackoverflow.com/a/9179426).   

> **_NOTE:_** What's important, is will not work with **any** change of return type - base class to derived or vice versa, e.t.c

## New struct fields braking change

Another interesting example of non backward compatible change is adding new instance field to struct that didn't had any non public fields already. This change other then previous one will be braking for high-level libraries as well as normal internal app code.
Let's examine this struct example:

```csharp
public struct ExampleStruct
{
    public int X;
}
```

Caller can use such struct's without calling constructor or initializing the local to `default` (as long as all public fields will be setup):
```csharp
ExampleStruct example;
example.X = 1;
Console.WriteLine(example.X);
```

Now, adding non-public field will result in braking changes:
```diff
public struct ExampleStruct
{
    public int X;
+   private int y;
}
```

```console
[CS0165] Use of unassigned local variable 'example'
```

Because there wasn't any non public fields to this moment - compiler has no initialized fields at creation time. To fix it, client will need to use constructor or initialize struct to `default`.

We will result in braking change also by adding public field:
```diff
public struct ExampleStruct
{
    public int X;
+   public int Y;
}
```
Client will be require to initialize struct as above or setup value of `Y` same as `X` was.


# Summary

All above is just touch the tip of the iceberg. We just showed two very specific situations were things can go wrong. There were been planty of those documentet in great article [here](https://learn.microsoft.com/en-us/dotnet/core/compatibility/library-change-rules).
