import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import sharp from 'sharp';
import { listFiles, createFolder, saveFile, deleteFileItem, getFileStream, getFileById } from '../../core/files.js';

const MAX_PREVIEW_SIZE = 10 * 1024 * 1024;
const THUMBNAIL_SIZE = 128;

export default async function filesRoutes(fastify: FastifyInstance): Promise<void> {
  // 列出所有文件/文件夹
  fastify.get('/', async (_request, reply) => {
    try {
      const files = listFiles();
      reply.send({ success: true, files, count: files.length });
    } catch (err) {
      _request.log.error({ err }, 'Failed to load files');
      reply.status(500).send({ success: false, error: 'Failed to load files' });
    }
  });

  // 获取单个文件
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);
    if (!file) {
      reply.status(404).send({ success: false, error: '文件不存在' });
      return;
    }
    reply.send({ success: true, file });
  });

  // 创建文件夹
  fastify.post('/folder', async (request, reply) => {
    try {
      const body = request.body as { name?: string; parentId?: string };
      if (!body.name || !body.name.trim()) {
        reply.status(400).send({ success: false, error: '文件夹名称不能为空' });
        return;
      }
      const folder = createFolder(body.name, body.parentId);
      reply.send({ success: true, file: folder });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  // 上传文件 — 接受包含 base64 内容的 JSON
  fastify.post('/upload', async (request, reply) => {
    try {
      const body = request.body as {
        files: Array<{ name: string; content: string; mimeType?: string }>;
        parentId?: string;
      };

      if (!body.files || body.files.length === 0) {
        reply.status(400).send({ success: false, error: '未提供文件' });
        return;
      }

      const saved: Array<{ id: string; name: string; size: number }> = [];
      const errors: Array<{ name: string; error: string }> = [];
      for (const f of body.files) {
        if (!f.name || !f.content) {
          errors.push({ name: f.name || '(未命名)', error: '缺少名称或内容' });
          continue;
        }
        try {
          const record = saveFile(f.name, f.content, f.mimeType, body.parentId);
          saved.push({ id: record.id, name: record.name, size: record.size });
        } catch (saveErr) {
          const msg = saveErr instanceof Error ? saveErr.message : '保存失败';
          errors.push({ name: f.name, error: msg });
        }
      }

      if (saved.length === 0) {
        reply.status(400).send({ success: false, error: '所有文件均保存失败', errors });
        return;
      }

      reply.send({ success: true, files: saved, count: saved.length, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  // 预览文件（内联，非附件）
  fastify.get('/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);

    if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path)) {
      reply.status(404).send({ success: false, error: '文件不存在或已被删除' });
      return;
    }

    if (file.size > MAX_PREVIEW_SIZE) {
      reply.status(413).send({ success: false, error: '文件过大，请下载查看' });
      return;
    }

    const content = fs.readFileSync(file.file_storage_path);
    reply.type(file.mime_type || 'application/octet-stream');
    reply.header('Content-Disposition', 'inline');
    reply.header('Content-Length', file.size);
    reply.send(content);
  });

  // 下载文件
  fastify.get('/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);

    if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path)) {
      reply.status(404).send({ success: false, error: '文件不存在或已被删除' });
      return;
    }

    const stream = fs.createReadStream(file.file_storage_path);
    reply.type(file.mime_type || 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    reply.header('Content-Length', file.size);

    stream.on('error', (err) => {
      request.log.error({ err }, '文件下载流错误');
      if (!reply.sent) {
        reply.status(500).send({ success: false, error: '文件读取失败' });
      }
    });

    reply.send(stream);
  });

  // 图片缩略图端点
  fastify.get('/:id/thumbnail', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);

    if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path)) {
      reply.status(404).send({ success: false, error: '文件不存在或已被删除' });
      return;
    }

    if (!file.mime_type?.startsWith('image/')) {
      reply.status(400).send({ success: false, error: '仅支持图片文件生成缩略图' });
      return;
    }

    try {
      const thumbnailBuffer = await sharp(file.file_storage_path)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      reply.type('image/jpeg');
      reply.header('Content-Length', thumbnailBuffer.length);
      reply.header('Cache-Control', 'public, max-age=86400');
      reply.send(thumbnailBuffer);
    } catch (err) {
      request.log.error({ err }, '生成缩略图失败');
      reply.status(500).send({ success: false, error: '生成缩略图失败' });
    }
  });

  // 删除文件/文件夹
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const file = getFileById(id);
      if (!file) {
        reply.status(404).send({ success: false, error: '文件不存在' });
        return;
      }
      const result = deleteFileItem(id);
      reply.send({ success: true, deleted: result.deleted });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });
}
