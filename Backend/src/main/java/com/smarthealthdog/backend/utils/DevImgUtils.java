package com.smarthealthdog.backend.utils;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile({"dev", "test"})
public class DevImgUtils implements ImgUtils {

    @Value("${local-storage.url-prefix}")
    private String localStorageUrlPrefix;

    @Value("${local-storage.ai-url-prefix}")
    private String aiModelServiceUrlPrefix;

    /**
     * 이미지 키로부터 이미지 URL을 생성합니다.
     * @param key 이미지 키
     * @return 이미지 URL
     */
    @Override
    public String getImgUrl(String key) {
        return localStorageUrlPrefix + "/uploads/" + key;
    }

    /**
     * AI 워커가 이미지를 접근할 수 있는 URL을 생성합니다.
     * @param key 이미지 키
     * @return 이미지 URL
     */
    @Override
    public String getImgUrlForAIWorker(String key) {
        return aiModelServiceUrlPrefix + "/uploads/" + key;
    }
}
