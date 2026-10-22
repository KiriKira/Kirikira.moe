从咫尺天涯到亲密无间——姐妹系统（双系统 Ver.）
==========

你是否曾苦恼于在 Linux Desktop 时总有开源拖拉机做不了的事，例如一些玩不了的游戏、不能完全割裂的国产毒瘤软件，以及迫于生活需要用的 Windows Only 专业软件；你是否曾对着 Windows 的各种暗坑气的跳脚，怀念起 *NIX 上完善的命令行工具套件以及各种开发和构建工具；你是否为了不彻底离开两者而安装了双系统，但是忍受着因为一点小事就不得不在两者之间来回切换？

废话不说了，本文将讲的是利用 virtualbox 的 rawdisk 在两者间任一个作为 host 启动时，将另一个在 VM 中作为 guest 启动，并通过一些设置使两者间的交互更加自然。

在我们开始之前，推荐你先阅读 eq 的 [双子系统(仮)环境安装指南](https://ekyu.moe/article/futago-system-kari-setup-guide/)，在对这个操作有一定的了解之后我们来看一下如何使它更加符合我们的要求。

**这个操作可能会适合你**，如果你：

* 喜爱 Linux Desktop，但是又因为各种原因而需要偶尔或经常用到 Windows 的一些软件，同时又不能接受 Wine（尤其是完成度低于 Steam Play 的 Wine 方案）；
* 喜爱 Windows，但需要 Linux 下的开发套件，不能完全接受 Cygwin，同时又嫌弃残缺不全的 WSL；
* 并不是很喜欢 Windows，但是在偶尔使用 Windows 的时候由于在 Linux 上的习惯，种种不通用的操作会导致浑身难受，例如在命令行上；
* 安装了双系统，但是对于在两者之间频繁重启切换这件事感到心烦；

以上的一三四点加起来就是我自己了。

**这个操作会更适合你**，如果你：

* 有足够大的内存（> 8G）
* 有足够好的性能来做虚拟化
* 将两个系统装在两块硬盘上
* 虽然有这么好的电脑但是却不直接搞两台电脑装系统（黑脸）

**风险提示！！！**：本操作未经过长时间测试，各种意外都有可能发生，如果用于生产环境请自己承担责任。

**开始前的提示**：本文中我使用的引导方式为 [systemd-boot](https://wiki.archlinux.org/index.php/systemd-boot)；系统为 <span class="red">Window 10 Pro 1809 Build 17763</span> 和 <span class="red">Arch Linux</span>，二者安装在同一块硬盘上并使用同一块 esp 分区；使用虚拟机程序为 [Oracle VM VirtualBox](https://www.virtualbox.org/). 如果使用不同搭配方案，请按实际情况调整。

那么，让我们开始吧。

事前准备
--------

先在硬盘上安装好两个系统，安装相应的程序并做好引导，主引导程序（例如 systemd-boot 或者 grub，如果你也是两个系统公用 esp 的话请在启动页面把两个系统的选项都加进来）必须放在 esp 分区的 <span class="red">/EFI/Boot/bootx64.efi</span>, 因为 vbox 并没有 bios 界面，它会默认读取这个路径的 efi 文件来启动系统。

Linux 上启动 Windows
----------

这部分是参考的 <https://blog.lilydjwg.me/2018/2/14/start-local-other-os-in-virtualbox.212161.html> 。

首先我们查看一下硬盘信息：

```bash
$ fdisk -l
Disk /dev/nvme0n1：238.5 GiB，256060514304 字节，500118192 个扇区
Disk model: THNSN5256GPU7 NVMe TOSHIBA 256GB
单元：扇区 / 1 * 512 = 512 字节
扇区大小(逻辑/物理)：512 字节 / 512 字节
I/O 大小(最小/最佳)：512 字节 / 512 字节
磁盘标签类型：gpt

设备                起点      末尾      扇区   大小 类型
/dev/nvme0n1p1      2048     34815     32768    16M Microsoft 保留
/dev/nvme0n1p2     34816 260263935 260229120 124.1G Microsoft 基本数据
/dev/nvme0n1p3 260263936 261494783   1230848   601M Linux 文件系统
/dev/nvme0n1p4 261494784 262471679    976896   477M EFI 系统
/dev/nvme0n1p5 262471680 500113407 237641728 113.3G Linux 文件系统
```

于是我所使用的这块硬盘为 <span class="red">/dev/nvme0n1</span>, 它的第 2 个分区为 Windows 主分区，第 4 个分区为 esp 分区，第 5 个分区为 Linux 的根目录分区。因此我们将分区 2 和 4 做进 rawdisk：

```bash
// 临时给主用户(kiri)赋予直接访问磁盘权限，以便之后不用提权启动 vbox
$ sudo setfacl -m u:kiri:rw /dev/nvme0n1p1{,2,4}
// 生成 vmdk
$ VBoxManage internalcommands createrawvmdk -filename hostdisk.vmdk -rawdisk /dev/nvme0n1p1 -partitions 2,4 -relative
// 将临时授予的权限取消
$ sudo setfacl -b /dev/sda
```

值得注意的是 -partitions 选项，即使不加你也可以做出可用的 rawdisk，但问题是一个文件系统同时被两个 OS 挂载是一件非常危险的事，要尽量避免！！这也是我说更推荐把两个系统装在两个硬盘上的原因，如果整块硬盘专属于一个系统的话，你也可以不用 vbox 而使用更好的 kvm，但很遗憾 xps 没位置加新硬盘了，我只能装在同一个硬盘上。

将这样的 vmdk 导入 vbox 的虚拟介质，然后新建一个虚拟机，在虚拟机的 设置 -> 系统 -> 主板 中选择启用 EFI，接着启动就会出现 systemd-boot 的启动项选择界面，选择 windows，就大功告成啦~

![缺德](https://i.yusa.me/lbCEzrYdEq6E.jpg)
___<center>缺德成功效果图</center>___

其余优化性能的设置请自己摸索。由于我在 Linux 上启动 Windows 时不会干太大的事（主要是内存小性能差 pmp），因此这部分就简单说到这里了。

在下一部分开始之前
--------

首先，在 Windows 上启动 Linux 时，一般来说我们不需要 Linux 的图形界面，只需要它的命令行而已。我们接下来要做的事情有——

* 添加无图形界面的 Linux 启动项；
* 制作 rawdisk 并在 Windows 上启动 Linux 为 VM；
* 通过端口映射，用 SSH 连接 Linux；
* 在 Host（宿主机，即 Windows）上挂载 Guest（客户机，即 Linux）的目录，可以使用 NFS/Samba/SSHFS 等，示例采用 NFS；
* 在 Guest 上挂载 Host 的目录，可用 Windows 自带的网络共享（CIFS）或 vbox 自带的共享文件夹，示例采用 CIFS。

Windows 上启动 Linux
---------

首先为我们的 systemd-boot 添加无界面启动项，参考 [kernel_parameters#Parameter_list](https://wiki.archlinux.org/index.php/kernel_parameters#Parameter_list) 和 [systemd_targets](https://wiki.archlinux.org/index.php/Systemd#Mapping_between_SysV_runlevels_and_systemd_targets) 可知，图形化的 service target 在 runlevel 5，因此我们只需要在 level 5 以下就能避免启动图形界面。

现在 /boot 目录的结构是这样的：

```bash
$ tree /boot
├── EFI
│   ├── Boot
│   │   └── bootx64.efi
│   ├── Microsoft
│   │   ├── ...
│   └── systemd
├── initramfs-linux-fallback.img
├── initramfs-linux.img
├── loader
│   ├── entries
│   │   ├── arch.conf
│   └── loader.conf
└── vmlinuz-linux

$ cat loader/loader.conf
timeout 10
default arch

$ cat loader/entries/arch.conf
title   Arch Linux
linux   /vmlinuz-linux
initrd  /initramfs-linux.img
options root=PARTUUID=8dc5ce26-1566-4315-bcec-2135898641a9 rw
```

在 arch.conf 旁边加一个 arch-silent.conf，它跟 arch.conf 的区别只是多了一个内核参数：

```bash
$ cat loader/entries/arch-silent.conf
title   Silent Arch
linux   /vmlinuz-linux
initrd  /initramfs-linux.img
options root=PARTUUID=8dc5ce26-1566-4315-bcec-2135898641a9 rw systemd.unit=multi-user.target
```

重启你就能看到选项里多了一个 Silent Arch 了，它可能位于 Arch 的下面，处于整个列表第二位，总之先姑且记一下它的位置。

接下来就要切换到 Windows 来叫醒姐妹了。

```cmd
// 先用管理员权限打开一个 cmd 窗口
$ wmic diskdrive list brief
Caption                           DeviceID            Model                             Partitions  Size
SDHC Card                         \\.\PHYSICALDRIVE3  SDHC Card                         1           31157360640
THNSN5256GPU7 NVMe TOSHIBA 256GB  \\.\PHYSICALDRIVE0  THNSN5256GPU7 NVMe TOSHIBA 256GB  4           256052966400
External USB3.0 SCSI Disk Device  \\.\PHYSICALDRIVE2  External USB3.0 SCSI Disk Device  2           240054796800
Generic- SD/MMC USB Device        \\.\PHYSICALDRIVE1  Generic- SD/MMC USB Device        0
```

与刚刚在 Linux 上使用 fdisk 相似的，我们看到了目标硬盘的 DeviceID 为 <span class="red">\\.\PHYSICALDRIVE0</span> 。不过你可能也注意到了 Windows 说我这个硬盘上只有 4 个分区，跟刚刚 Linux 说好的不一样啊？不要管它，这是因为 Windows 没有统计进它自己的恢复分区（在 fdisk 里可以看到位于第一位），一会我们按照 fdisk 的结果来就行。

```cmd
// 创建 rawdisk
$ "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" internalcommands createrawvmdk -filename hostdisk.vmdk -rawdisk  \\.\PHYSICALDRIVE0 -partitions 4,5
```

然后一样将 hostdisk.vmdk 导入 vbox 虚拟介质，不过还需要注意一些细节：由于 Windows 访问磁盘必须有管理员权限，因此启动 vbox 时应选择以管理员身份启动；在创建虚拟机后进入设置，勾选“启用 EFI”，在 存储器 -> 控制器：SATA 位置的右侧勾选“使用主机输入输出缓存”（如图），接着就可以点击启动了。

![使用主机输入输出缓存](https://i.yusa.me/W3txDMK764Y1.png)

不等等，事情可能还没有在 Linux 上这么顺利——**你接下来看到的可能是一片黑屏**。不过别怕，只要它没有弹出错误就代表虚拟机在正常运行了，按照你刚刚记下的 Silent Arch 的位置盲打键盘，例如我的在第二位那么就连续交替按方向键下和 Enter ——如果你对这个操作感觉有点沙雕，那你可以在下次把 Silent Arch 设置为默认启动项。好了，万事大吉，可爱的妹妹机已经在翘首以待了！

等等，工作还没做完，与在 Linux 上启动 Windows 不同，这次我们不是仅满足止步于此的。

先检查一下我们的网络设置。为了把妹妹和肮脏的外面的世界隔离开来，我们使用 NAT 网络，这样妹妹就可以经姐姐的手看向大千世界了——但是残酷的是，姐姐却不能主动去看看自己可爱的妹妹。于是，我们就需要端口映射。

![设置端口映射](https://i.yusa.me/AXInq6Y9nzqJ.png)

为了世界和平，我把妹妹的端口都按数字原封不动映射到姐姐的本地环回 127.0.0.2 上，与 127.0.0.1 相比这样可以避免与 Windows 本地的服务端口冲突，或是为了避免冲突而将端口号修改。

现在用你喜欢的 SSH 去拜访妹妹吧：

```bash
// 使用 ssh 连接妹妹，当然记得先开启你的 sshd.service
$ ssh kiri@127.0.0.1
```

![缺德](https://i.yusa.me/JGHv8WQP9dXd.png)
___<center>缺德成功效果图</center>___

再来就是做我们刚刚计划中的，实现文件系统互相挂载。从妹妹机到姐姐机，更方便的方式是使用 Samba，毕竟 Windows 默认就会支持了。不过嘛，为了让我这篇文章的价值稍微高一点，我们就用 NFS 吧hhh。

在 Windows 中开启 NFS client 功能：Windows Features -> NFS 服务 -> 勾选“NFS 客户端”功能并重启 Windows。（如图）

![NFS client](https://i.yusa.me/GXhDQW07Kpo7.png)

回到本文的上上上张截图，除了最上面的 SSH 22 端口以外，我还映射了包括 TCP 和 UDP 的端口 111, 2049, 20048，这三个是 NFS 必须的。然后来配置妹妹上的 NFS server：

```bash
// 安装 nfs-utils
$ sudo pacman -S nfs-utils

// 设置要共享的文件夹
$ sudo vim /etc/exports
/home/kiri/projects 10.0.2.0/24(rw,subtree_check,all_squash,anonuid=1000,anongid=998)

// 启用 NFS
$ sudo exportfs -ra
$ sudo systemctl enable nfs-server --now

// 如果你还有防火墙需要设置的话，就自己设置吧
```

然后在 Windows 上用 **普通权限的 cmd** 进行挂载，注意这次不要用管理员权限的！

```cmd
// 挂载到 S:
$ mount -o mtype=soft -o anon 127.0.0.2:/home/kiri/projects S: 
```

打开 explorer，就能看到挂载好的目录完全可用了。或者你也可以用 explorer 来操作：在地址栏输入 \\\\127.0.0.1 ，然后右键相应文件夹，把他映射为盘符即可。本文就是在 NFS 共享的文件夹里直接打开 md 文件，现在 Linux 上写完前半部分再在 Windows 上写现在的部分完成的。

不过嘛，NFS on Windows 用起来还是毛病比较大，具体后面再说。

再来把姐姐的文件夹给妹妹挂载，选择 C:\kiri\ 这个文件夹，右键，属性，共享，将其设置为共享目录，这样就会显示共享目录在网络上的路径是 \\\\hostname\kiri

```bash
// 先获取姐姐的 ip
$ ip r
default via 10.0.2.2 dev enp0s3 proto dhcp metric 101
10.0.2.0/24 dev enp0s3 proto kernel scope link src 10.0.2.15 metric 101

// 所以姐姐的 ip 是 10.0.2.2, 共享目录是 //10.0.2.2/kiri
$ sudo mount -t cifs -o username="Kiri",password="***" //10.0.2.2/kiri /mnt/C

// 这样姐姐的 C:\kiri\ 就被挂载到妹妹的 /mnt/C 了
```

最后就是针对个人习惯的设置了，比如你不想每次打开 vbox 的窗口再点启动的话，就先再 systemd-boot 里把默认启动项改为 silent-arch，然后在管理员权限的 cmd 里使用

```cmd
$ vboxmanage.exe startvm Arch --type headless
```

目前已知的一些小问题
------------

上面也提到过了，这套方案没有经历过任何长时间验证，请对自己的系统和数据负责。在每台电脑上可能也会有不同的细节差异，比如我的电脑上经历的问题有：

* Linux 启动 Windows 时声音撕裂，极其鬼畜，因此也断了拿来打游戏的念想（本来我的性能也不够嘛hh）。还有开始菜单的图标会变花，不过不影响使用就是了。
* Windows 启动 Linux 时有一次因为不明原因 vbox 识别不了之前的 rawdisk 文件，debug 半天找不到原因，最后重启就好了O< O
* 我到现在都没有找到一个 Windows 平台足够满意的终端模拟器，用来代替 Linux 上时用的 konsole 和 yakuake。
* NFS on Windows 也还是有些坑的，尤其是权限问题。Windows 默认的 uid 和 gid 是 65534，即 -2，对应 Linux 上的用户为 nobody，不知道为什么始终无法打开整个 /home/kiri，因此最后只共享了权限设置为 755 的项目文件夹 /home/kiri/projects ，比起来也姑且算是更安全一点了。到最后，其实还是推荐使用 samba。
* vbox 自带的共享文件夹据 eq 说也有权限坑，所以我就不尝试了。

TODO
-----------

* 像 eq 一样编写一些自动化脚本。不过因为我终究用 Windows 的时间比较短，可能也要以后再说了。
* 如果 openssh server on windows 能用的话，还能更好地集成两者间的调用，不过看起来会有无数坑要踩。
* 换新电脑以后用 kvm 代替 vbox 试试（猴年马月）。

总算是在过年前把这篇文章缺德出来了，这样下一篇文章就可以留给年终总结了。不过看起来明天是咕不出来了，所以在这里就提前说一声，元旦快乐啦！！