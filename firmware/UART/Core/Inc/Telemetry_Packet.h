#ifndef PACKET_H
#define PACKET_H

#include "stm32f4xx_hal_conf.h"

#pragma pack(push, 1)
struct Telemetry_Packet{
    uint16_t  packet_id; //1
    float temp; //4
    double latitude; //8
    double longitude; //8
    float altitude; //4
    float utc_time; //4
    float velocity; //4
};
#pragma pack(pop)

#endif