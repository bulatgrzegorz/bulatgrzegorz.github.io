---
date: 2023-06-21 13:27:58
layout: post
title: "Few stories about breaking changes"
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

# Breaking change

Just for start, we may actually try deciding what "Breaking change" actually means. In software we could generalize it as any change that make code stop running or compiling ([link](https://stackoverflow.com/a/21703427)).

More specific definition of `compatibility` can be found [here](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/version-update-considerations), where term was divided into specific types. Below we will show some examples of non-binary-compatible changes.

And as we can easily imagine many of such changes, there are some (in .NET world) that seems not so obvious at first glance.

Many of those we can find when creating .NET libraries. Some changes that wouldn't be normally considered breaking will be one when introduced in some specific usage situations.

How much library changes can effect in breaking changes can differ in how it is being used. We can distinguish two main types:

### High-level library

This kind of libraries are less sensitive to breaking changes - those libraries are being referenced directly in client’s application

![dependency-diagram](/assets/img/posts/breakingchanges/high-level-lib-diagram.png)

Those are less sensitive, because even when breaking change was introduced, client can decide to change version of it or just modify application itself.

### Low-level library

Hardest in maintaining backward compatibility are low-level libraries, that are used as building blocks - in clients code or as part of other libraries (serializers, parsers, ...). It's different because such high-level libraries may be compiled against older version of library, where API was different. 

![dependency-diagram](/assets/img/posts/breakingchanges/low-level-lib-diagram.png)

# Examples

We will only describe some examples of breaking changes that in my perspective are quite easy to be missed.

## Method parameters breaking change

In this example, we will discussing binary breaking change while developing low-level libraries changes that wouldn't be such in normal application code or high-level libraries.

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
and reference new version of library implicitly in client project. Everything compiling fine, but after running client code we are getting exception:
```console
Unhandled exception. System.MissingMethodException: Method not found: 'Void low_level_lib.LowLevelClass.Method(Int32)'.
   at high_level_lib.HighLevelClass.Method()
   at Program.<Main>$(String[] args) in ...\Program.cs:line 4
```

![impossible](/assets/img/posts/breakingchanges/thats-impossible.gif)

That's happening because how optional parameters are being handled by compiler. Let's check lowered version of our client code after library has been updated:
```csharp
LowLevelClass.Method(1, (string) null);
```
Method invocation was effectively converted to call using all parameters. This is not happening in high-level library that was already compiled against old version of low-level library and such "conversion" didn't happen.

There are few solutions to this problem, we could either:
* Recompile high-level library using new version of low-level library
* Make change in low-level library in little bit different manner:

```csharp
public static class LowLevelClass
{
    public static void Method(int var1) => { }
    public static void Method(int var1, string? var2 = null) => { }
}
```

This way overload of method with just one parameter will still exists, making high-level library works correctly, while in same time we can use overload with new parameter as well in clients code.

## Method return type breaking change

Same exception would happen if we would try to change return type (even if such is not being used anywhere):
```csharp
public static class LowLevelClass
{
    public static double Method(int var1) => 1;
}
```

Why this isn't allowed has been explained in great stackoverflow [answer](https://stackoverflow.com/a/9179426).   

> **_NOTE:_** What's important, is that it will not work with **any** change of return type - base class to derived or vice versa, etc.

## New struct fields breaking change

Another interesting example of non-backward compatible change is adding new instance field to struct that didn't have any non-public fields already. This change other than previous one will be breaking for high-level libraries as well as normal internal app code.
Let's examine this struct example:

```csharp
public struct ExampleStruct
{
    public int X;
}
```

Caller can use such structs without calling constructor or initializing the local to `default` (as long as all public fields are setup):
```csharp
ExampleStruct example;
example.X = 1;
Console.WriteLine(example.X);
```

Now, adding non-public field will result in breaking changes:
```csharp
public struct ExampleStruct
{
    public int X;
    private int y;
}
```

```console
[CS0165] Use of unassigned local variable 'example'
```

Because there weren’t any non-public fields to this moment - compiler didn't initialized fields at creation time. To fix it, client will need to use constructor or initialize struct to `default`.

We will end up in breaking change also by adding public field:
```csharp
public struct ExampleStruct
{
    public int X;
    public int Y;
}
```
Client will be required to initialize struct as above or setup value of `Y` same as `X` was.

## Method overload with Breaking behavior

Imagine following method exposed in some library:

```csharp
public static class HighLevelClass
{
    public static void Method(uint value) => Console.WriteLine($"uint: {value}");
}
```

when consumed in following way:

```csharp
HighLevelClass.Method(1);
```

compiler will bind to overload of `uint` version: (low level c#):
```csharp
HighLevelClass.Method(1U);
```

If new overload of method will be introduced in library:
```csharp
public static class HighLevelClass
{
    public static void Method(uint value) => Console.WriteLine($"uint: {value}");
    public static void Method(int value) => Console.WriteLine($"int: {value}");
}
```

and client updates library dependency and recompiling its code, will use new method overload with `int` parameter (compiler will no longer cast value and use `int` overload). This can introduce behavior breaking change, as new overload of method can introduce different implementation then existing one.

# Summary

All above is just touch the tip of the iceberg. We just showed two very specific situations where things can go wrong. There have been plenty of those documented in great article [here](https://learn.microsoft.com/en-us/dotnet/core/compatibility/library-change-rules).


