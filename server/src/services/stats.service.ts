import os from 'os';
import checkDiskSpace from 'check-disk-space';
import { config } from '../config';

export class StatsService {
  static async getServerStats() {
    const cpuUsage = os.loadavg()[0];
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercentage = (usedMem / totalMem) * 100;

    let diskSpace = { free: 0, size: 0 };
    try {
      diskSpace = await checkDiskSpace(config.uploadDir);
    } catch (e) {
      // Ignore
    }
    const diskPercentage = diskSpace.size ? ((diskSpace.size - diskSpace.free) / diskSpace.size) * 100 : 0;

    return {
      cpu: {
        loadAverage: cpuUsage,
        cores: os.cpus().length
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        percentage: memPercentage
      },
      disk: {
        total: diskSpace.size,
        free: diskSpace.free,
        used: diskSpace.size - diskSpace.free,
        percentage: diskPercentage
      },
      uptime: process.uptime()
    };
  }
}
