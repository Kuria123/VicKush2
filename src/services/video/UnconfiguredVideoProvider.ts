import {
  videoFail,
  type VideoJob,
  type VideoProvider,
  type VideoProviderDescriptor,
  type VideoResult,
  type VideoScript,
} from '@/domain/video';

/**
 * The provider used when no video backend is configured.
 *
 * Which is the case here, and the honest thing to do about it is nothing. The
 * alternative — a stock clip of somebody else's engine bay presented as "your
 * repair video" — would be worse than an empty panel, because a viewer
 * following footage of a different vehicle is being actively misled about
 * where components are.
 *
 * It declares no capabilities, so the UI reads the descriptor and says the
 * feature is unavailable rather than offering a button that cannot work.
 */
export class UnconfiguredVideoProvider implements VideoProvider {
  describe(): VideoProviderDescriptor {
    return {
      id: 'unconfigured',
      name: 'No video provider configured',
      capabilities: [],
      configured: false,
    };
  }

  async render(_script: VideoScript): Promise<VideoResult<VideoJob>> {
    void _script;
    return videoFail(
      'NOT_CONFIGURED',
      'No video provider is configured, so nothing can be rendered. The written procedure is complete without a video.',
    );
  }

  async getJob(_jobId: string): Promise<VideoResult<VideoJob>> {
    void _jobId;
    return videoFail('NOT_CONFIGURED', 'No video provider is configured.');
  }
}
