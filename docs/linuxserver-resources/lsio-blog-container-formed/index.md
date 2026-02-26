[ ](https://www.linuxserver.io/)
  * [Home](https://www.linuxserver.io/)
  * [Images](https://www.linuxserver.io/our-images)
  * [Blog](https://www.linuxserver.io/blog)
  * [Docs](https://docs.linuxserver.io/)
  * [Info](https://info.linuxserver.io)
  * [Status](https://status.linuxserver.io/)
  * [Donate](https://www.linuxserver.io/donate)
  * [Support](https://www.linuxserver.io/support)


![Hero Image](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/31744142112_a26c56ff04_k.jpg)
3rd Feb 2023  - spad 
#  [](https://www.linuxserver.io/blog/how-is-container-formed#how-is-container-formed) How Is Container Formed? 
[ docker  ](https://www.linuxserver.io/blog/tag:docker#blog_list) [ open source  ](https://www.linuxserver.io/blog/tag:open%20source#blog_list) [ linuxserver  ](https://www.linuxserver.io/blog/tag:linuxserver#blog_list) [ images  ](https://www.linuxserver.io/blog/tag:images#blog_list) [ deep dive  ](https://www.linuxserver.io/blog/tag:deep%20dive#blog_list)
##  [](https://www.linuxserver.io/blog/how-is-container-formed#introduction)Introduction
One of the questions we get asked pretty regularly is: "How do I customise/modify/otherwise make use of one of your images?". Now, some of this is already covered in our documentation, and reading that always helps, but I thought it might be instructive to run through the details of how our containers actually hang together and what the various options for extending and customising them are. This isn't going to be a hugely technical post, but it does assume a basic level of understanding of both Linux and containers generally, and you might struggle to follow it without that.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#container-design)Container Design
There are 3 main schools of thought when it comes to container design: One says that a container should run a single _process_ , and you should have as many containers as you need to run the processes for your application. The second says that a container should run a single _application_ , and you should have as many processes as you need to do so in a single container (excluding databases, KV caches, etc.). The third says that a container should run _everything_ you need for an application; front end, back end, database, cache, kitchen sink.
We subscribe to the second approach, in part because our target audience wants straightforward setups and doesn't want to run 9 separate containers for a password manager, and in part because sometimes it just doesn't make sense to split things out into their own containers just for the sake of ideological purity. In addition, our containers don't really need to be highly scalable because they're mostly used in homelab environments where you're looking at tens of users, not tens of thousands. That doesn't mean you _can't_ scale our containers, but there are some inherent limitations when you move beyond One Container, One Process that need careful planning to work around.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#keeping-track-of-your-processes)Keeping Track of Your Processes
If you're going to be running more than one process, you need a process manager, just like you would on a native host. There are a number of options depending on your needs; everything from full-on systemd if you're completely mad, to options like SysVinit and supervisord, all the way down to our init of choice s6. Specifically, we make use of [s6-overlay](https://github.com/just-containers/s6-overlay), which is a bundle of tarballs and init scripts designed to make it easy to run s6 as your process manager in a container. We recently went through a complete overhaul of our init process to take advantage of the new features available in version 3 of s6-overlay, and that's what I'm going to focus on in this post.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#init-basics)Init Basics
The very short version of how our container init works is as follows:
  * On build, our base image installs s6-overlay and sets its entrypoint to the s6 /init script
  * On container start, s6 sets up the basic container environment
  * We run our docker-mods logic to download and extract any Mods that users are installing
  * s6 iterates through our init scripts setting up users, configuring folders and permissions, and anything else the application we're running needs
  * Any Mods are applied and have their init logic executed
  * Any Custom Files are run
  * s6 starts any services required for the application. A lot of the time there is just a single service, but some need 2 or more
  * Any Custom Services are started
  * We run readiness checks to confirm the service(s) startup has completed successfully
  * A final init step runs to flag the container startup as complete


If at any point one of these steps fails, the whole init is halted to prevent you ending up with a container in a broken state. We _don't_ typically shut down the container entirely because if you've set a restart policy of `unless-stopped` or `always` it will just loop infinitely, which is worse than it sleeping forever because it will cause weird resource spikes as it keeps running through the init steps over and over.
The practical reality is usually a bit more complicated because there are often multiple base images involved. For example, our Webtop images are built from our rdesktop-web base image, which is built from our rdesktop base image, which is built from one of our "true" base images.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#choosing-a-base-image)Choosing a Base Image
We have quite a few different base images at our disposal:
[![Base Images](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/bases.png?sizes=%28max-width%3A26em%29%2B100vw,%2B50vw)](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/bases.png)
Where possible we default to our Alpine base image, or its derivatives, such as our nginx base. It's small, fast, has releases every 6 months which are supported for 2 years, and keeps packages up to date; it even has a rolling release for containers that need to live on the bleeding edge. The downside is that it uses muslc rather than glibc, which is a very long and very boring discussion in and of itself, but the short version is that things compiled for glibc won't usually run under muslc (and vice versa) and not everyone produces muslc-compatible binaries.
If we can't use Alpine, either because of the muslc issue or because - for example - the only way an application is distributed is an apt PPA repo, then we'll use our Ubuntu base image. It's a little chunkier than Alpine, and much slower to update packages because we use the LTS releases (non-LTS releases only get 9 months of support, which is just far too short), but pretty much everything will run under it.
As a last resort, we have Arch and Fedora base images, for things that we just can't get working any other way.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#added-extras)Added Extras
s6-overlay is great, but it can't do _everything_ (nor should it) so we've added our own functionality to our base images to support a number of different features that we offer our users. We have also been very fortunate in that the developer of s6 has incorporated some of the hacks we had come up with into actual features, which has made them substantially easier to manage. A lot of the following falls heavily into the "Don't Try This At Home" category; if you want to make use of these features then you're quite welcome to use our base images for your own container builds, rather than trying to craft your own logic from scratch.
###  [](https://www.linuxserver.io/blog/how-is-container-formed#mods)Mods
[Docker mods](https://mods.linuxserver.io/) are our surprisingly elegant hack to allow 1st and 3rd party additions to containers without requiring users to build their own images. Essentially a single layer image that gets downloaded from Docker Hub or GHCR and applied on container startup, they allow the addition of custom packages, init steps, and services. There's a detailed explanation of how mods work in the [readme](https://github.com/linuxserver/docker-mods/blob/master/README.md) for the repository. The mod logic runs before any other init steps, but the mods themselves are executed later in the process.
The mod logic itself is pulled at build time from our [mods repository](https://github.com/linuxserver/docker-mods/tree/mod-scripts), which allows us to update it without having to individually modify every base image branch. The same script also pre-processes custom files and services and sets up some aliases for use during the init process.
###  [](https://www.linuxserver.io/blog/how-is-container-formed#custom-files-services)Custom Files / Services
When a mod is overkill, you can instead make use of our [Custom Files & Services](https://linuxserver.io/custom) logic. This approach offers much less control over the container init process, but is also very simple to use; mounting a folder with some scripts in it is pretty much the only requirement. Custom files and services always run after their built-in counterparts, and after any mods, so bear that in mind when implementing them.
Typical use-cases are things like installing extra packages (although there is a [mod for that](https://github.com/linuxserver/docker-mods/tree/universal-package-install)), checking VPN connectivity, configuring alerting, or making other configuration tweaks beyond what we offer out of the box.
###  [](https://www.linuxserver.io/blog/how-is-container-formed#ci-tests)CI Tests
All of our image builds get run through a series of CI smoke tests to check that they're basically functional before they get pushed to their various registries. While some images lack a GUI, or need external resources like databases and so can't be automatically tested in their entirety, a full test output looks something like this: 
[![plexci](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/plexci.png?sizes=%28max-width%3A26em%29%2B100vw,%2B50vw)](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/plexci.png)
We have a trigger at the end of the init process which outputs a simple `[ls.io-init] done.` to indicate to the test platform that startup has completed successfully (or at least as successfully as we can reasonably determine).
###  [](https://www.linuxserver.io/blog/how-is-container-formed#version-checking)Version Checking
We are very careful when updating our images to try and avoid touching any config that you might have modified yourself. This typically means anything in `/config` is off-limits unless we don't have any other option. The problem is that while we can leave your configs alone, we usually make our changes for a reason, which is why our nginx base image has logic to check its confs against those already in your `/config` mount and notify you in the init logs if they've changed:
[![versions](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/versions.png?sizes=%28max-width%3A26em%29%2B100vw,%2B50vw)](https://www.linuxserver.io/user/pages/03.blog/how-is-container-formed/versions.png)
Now obviously if you never look at your container logs you'll never see this (and even then sometimes people somehow manage to miss it), but at the very least it means when you come to us for support and provide those logs, _we_ can see where the issue lies.
###  [](https://www.linuxserver.io/blog/how-is-container-formed#init-hooks)Init Hooks
Sometimes we need to be able to dynamically modify the container configuration at runtime. This isn't straightforward - or usually a good idea - as all the services and init scripts are baked in at build time and can't be modified once the application init process has begun, but occasionally it's the only practical way to do it. In these situations we make use of an s6 feature called `S6_STAGE2_HOOK`: this allows us to run scripts _before_ the application part of the init starts, and is how we run our Mods logic. An init hook of this type can modify services and init scripts, or remove them entirely and prevent them from starting.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#diy)DIY
###  [](https://www.linuxserver.io/blog/how-is-container-formed#build-it-yourself)Build It Yourself
Using our base images to build your own container is really pretty simple, and a lot of the time you can just take an existing container and modify things to suit. That said, there are some caveats that you need to consider:
  * RTFM and make sure you understand how [s6-overlay](https://github.com/just-containers/s6-overlay) works.
  * There is no `latest` tag for any of our base images, by design. Pick a release version and only update it once you've checked very carefully that it's not going to completely break your image. We often make breaking changes between versions, and we don't publish release notes like we do for the downstream images.
  * If you're intending to distribute your image, please read our [blog post on container branding](https://www.linuxserver.io/blog/brand-new) first.
  * We don't _formally_ support our base images - if you run into issues and need help, we'll do our best to assist, but we're not going to make changes that could impact our entire fleet just to fix your weird edge-case problem.


###  [](https://www.linuxserver.io/blog/how-is-container-formed#ruin-an-existing-image)Ruin An Existing Image
There are a truly staggering number of ways that you can modify our existing images beyond what I've documented here, all of which are _wildly_ unsupported, and thus I'm not going to help you figure out how to implement them. That said, if you have an understanding of containers in general, and s6 specifically, you can do a lot of things you probably shouldn't without the need to build your own derivative image with all the administrative overhead that entails.
As ever, our support policy is very simple: if you know what you're doing, go nuts, change whatever you like - however ill-advised - but don't come to us for support with it when something goes catastrophically wrong. If you _don't_ know what you're doing, please don't blindly follow some dude's YouTube video guide on how to customise our Nextcloud image using Portainer, for so many reasons.
##  [](https://www.linuxserver.io/blog/how-is-container-formed#going-further)Going Further
All of our images, and build pipeline tools, are [on Github](https://github.com/orgs/linuxserver/repositories) so you can look at the source, clone or fork the repositories, and generally do whatever you like with them, within the bounds of their licences. If you think you've made a cool or useful improvement to one of our images, you can always submit a PR for us to integrate it, just be aware that we won't typically accept PRs that add packages or features that the majority of users will not make use of - those are better suited to mods so that people can opt into them as required.
[](https://www.linuxserver.io/blog/automating-the-boring-stuff-with-jinja) [Next Post ](https://www.linuxserver.io/blog/advanced-wireguard-container-routing)
[Team](https://github.com/orgs/linuxserver/people) [Support](https://www.linuxserver.io/support) [Donate](https://www.linuxserver.io/donate)
[ ](https://github.com/linuxserver) [ ](https://docs.linuxserver.io/) [ Mastodon ](https://mastodon.linuxserver.io/@linuxserver) [ ](https://bsky.app/profile/linuxserver.io)
[ ](https://www.digitalocean.com/)
System Light Dark
  * [Home](https://www.linuxserver.io/)
  * [Images](https://www.linuxserver.io/our-images)
  * [Blog](https://www.linuxserver.io/blog)
  * [Docs](https://docs.linuxserver.io/)
  * [Info](https://info.linuxserver.io)
  * [Status](https://status.linuxserver.io/)
  * [Donate](https://www.linuxserver.io/donate)
  * [Support](https://www.linuxserver.io/support)


